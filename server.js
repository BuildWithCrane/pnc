const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');
const { JSDOM } = require('jsdom');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

const app = express();
const parser = new Parser();

app.use(cors());

// Rate limiting — max 30 requests per minute per IP
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: "RATE_LIMIT_EXCEEDED" }
});
app.use('/api/', limiter);

const FEEDS = [
    { name: "BBC", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
    { name: "AL_JAZEERA", url: "https://www.aljazeera.com/xml/rss/all.xml" }
];

// --- In-memory cache ---
let cache = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// --- Jaccard similarity for title matching ---
function jaccardSimilarity(a, b) {
    const setA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const setB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    if (setA.size === 0 || setB.size === 0) return 0;
    const intersection = new Set([...setA].filter(w => setB.has(w)));
    const union = new Set([...setA, ...setB]);
    return intersection.size / union.size;
}

// --- Scrape article body with timeout ---
async function scrapeArticleBody(url, timeoutMs = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const dom = await JSDOM.fromURL(url, { signal: controller.signal });
        clearTimeout(timer);
        const pTags = dom.window.document.querySelectorAll(
            'article p, .ssrcss-1q0mxy8-RichTextContainer p, .main-article-body p, [data-component="text-block"] p'
        );
        return Array.from(pTags).map(p => p.textContent.trim()).filter(Boolean).join('\n\n');
    } catch (e) {
        clearTimeout(timer);
        return null; // caller handles fallback
    }
}

// --- Build article result objects ---
async function buildArticles(primaryItems, compareItems) {
    return Promise.all(primaryItems.map(async (item) => {
        const scraped = await scrapeArticleBody(item.link);
        const body = scraped ?? ((item.contentSnippet || '') + '\n\n[FULL_TEXT_UNAVAILABLE]');

        const id = crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();

        // Find best-matching AJ article by Jaccard similarity (threshold 0.15)
        let match = null;
        let bestScore = 0;
        for (const c of compareItems) {
            const score = jaccardSimilarity(item.title, c.title);
            if (score > bestScore) { bestScore = score; match = c; }
        }
        if (bestScore < 0.15) match = null;

        let discrepancy = null;
        if (match) {
            const timeA = new Date(item.pubDate);
            const timeB = new Date(match.pubDate);
            const diff = Math.abs(Math.floor((timeA - timeB) / 60000));
            if (diff > 5) {
                discrepancy = `TEMPORAL OUTLIER: BBC [${timeA.toLocaleTimeString()}] vs Al Jazeera [${timeB.toLocaleTimeString()}]. Variance of ${diff}m detected.`;
            }
        } else {
            discrepancy = `SOURCE ISOLATION: Story found on BBC World Service, but no matching coverage detected on Al Jazeera.`;
        }

        return {
            id,
            node: `GLO-SEC-${id}`,
            source: "BBC WORLD SERVICE",
            title: item.title.toUpperCase(),
            body,
            timestamp: new Date(item.pubDate).toLocaleString(),
            discrepancy,
            refs: [
                { label: "VERIFICATION", val: match ? "DUAL-NODE" : "ISOLATED" },
                { label: "PEER_SOURCE", val: match ? "AL_JAZEERA_01" : "NONE" },
                { label: "INTEGRITY", val: discrepancy ? "SCRUTINY_REQUIRED" : "STABLE" }
            ]
        };
    }));
}

app.get('/api/news', async (req, res) => {
    // Serve from cache if fresh
    if (cache && (Date.now() - cacheTimestamp) < CACHE_TTL_MS) {
        return res.json(cache);
    }

    try {
        const feedResults = await Promise.all(
            FEEDS.map(f => parser.parseURL(f.url).catch(() => ({ items: [] })))
        );
        const primaryItems = feedResults[0].items.slice(0, 10);
        const compareItems = feedResults[1].items;

        const results = await buildArticles(primaryItems, compareItems);

        cache = results;
        cacheTimestamp = Date.now();

        res.json(results);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "GRID_OFFLINE" });
    }
});

app.listen(3000, () => console.log(`GERGOV ENGINE ONLINE // PORT 3000`));
