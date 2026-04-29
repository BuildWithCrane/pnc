const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');
const { parse: parseHtml } = require('node-html-parser');
const fetch = require('node-fetch');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const config = require('./config');

const app = express();
const parser = new Parser();

// --- CORS locked to allowed origins ---
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || config.ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS: origin ${origin} not allowed`));
        }
    }
}));

// --- Rate limiting ---
app.use('/api/', rateLimit({
    windowMs: 60 * 1000,
    max: config.RATE_LIMIT_MAX,
    message: { error: "RATE_LIMIT_EXCEEDED" }
}));

const FEEDS = [
    { name: "BBC",        url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
    { name: "AL_JAZEERA", url: "https://www.aljazeera.com/xml/rss/all.xml" }
];

// --- Cache + in-flight deduplication ---
let cache = null;
let cacheTimestamp = 0;
let inflightPromise = null; // prevents thundering herd on cold cache

// --- Jaccard similarity ---
function jaccardSimilarity(a, b) {
    const setA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const setB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    if (setA.size === 0 || setB.size === 0) return 0;
    const intersection = new Set([...setA].filter(w => setB.has(w)));
    const union = new Set([...setA, ...setB]);
    return intersection.size / union.size;
}

// --- Normalise scraped body text ---
function normaliseBody(text) {
    return text
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// --- Scrape with node-fetch + node-html-parser (lightweight, no JSDOM) ---
async function scrapeArticleBody(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.SCRAPE_TIMEOUT_MS);
    const start = Date.now();

    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GERGOV/1.0)' }
        });
        clearTimeout(timer);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const root = parseHtml(html);

        const selectors = [
            '[data-component="text-block"] p',
            'article p',
            '.main-article-body p',
            '.article__body p',
        ];

        let paragraphs = [];
        for (const sel of selectors) {
            paragraphs = root.querySelectorAll(sel).map(p => p.innerText.trim()).filter(Boolean);
            if (paragraphs.length > 0) break;
        }

        console.log(`[SCRAPE] ${url} — ${paragraphs.length} paragraphs in ${Date.now() - start}ms`);
        return paragraphs.length > 0 ? normaliseBody(paragraphs.join('\n\n')) : null;
    } catch (e) {
        clearTimeout(timer);
        console.warn(`[SCRAPE FAIL] ${url} — ${e.message}`);
        return null;
    }
}

// --- Build articles ---
async function buildArticles(primaryItems, compareItems) {
    return Promise.all(primaryItems.map(async (item) => {
        const scraped = await scrapeArticleBody(item.link);
        const body = scraped ?? normaliseBody((item.contentSnippet || '') + '\n\n[FULL TEXT UNAVAILABLE]');

        const id = crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();

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
                { label: "PEER_SOURCE",  val: match ? "AL_JAZEERA_01" : "NONE" },
                { label: "INTEGRITY",    val: discrepancy ? "SCRUTINY_REQUIRED" : "STABLE" }
            ]
        };
    }));
}

// --- Core fetch logic ---
async function fetchFreshData() {
    const start = Date.now();
    console.log('[FEED] Fetching RSS feeds...');

    const feedResults = await Promise.all(
        FEEDS.map(f => parser.parseURL(f.url).catch(() => {
            console.warn(`[FEED FAIL] ${f.name}`);
            return { items: [] };
        }))
    );

    const primaryItems = feedResults[0].items.slice(0, 10);
    const compareItems = feedResults[1].items;
    console.log(`[FEED] Got ${primaryItems.length} primary / ${compareItems.length} compare items in ${Date.now() - start}ms`);

    const results = await buildArticles(primaryItems, compareItems);
    console.log(`[FEED] Built ${results.length} articles in ${Date.now() - start}ms total`);
    return results;
}

app.get('/api/news', async (req, res) => {
    // Serve fresh cache
    if (cache && (Date.now() - cacheTimestamp) < config.CACHE_TTL_MS) {
        console.log('[CACHE] HIT');
        return res.json(cache);
    }

    // If a fetch is already in flight, piggyback on it
    if (inflightPromise) {
        console.log('[CACHE] INFLIGHT — waiting for existing request');
        try {
            const results = await inflightPromise;
            return res.json(results);
        } catch {
            // Fall through
        }
    }

    inflightPromise = fetchFreshData();

    try {
        const results = await inflightPromise;
        cache = results;
        cacheTimestamp = Date.now();
        res.json(results);
    } catch (err) {
        console.error('[ERROR]', err);
        // Fall back to stale cache rather than a hard error
        if (cache) {
            console.warn('[CACHE] Serving stale cache after fetch failure');
            return res.json(cache);
        }
        res.status(500).json({ error: "GRID_OFFLINE" });
    } finally {
        inflightPromise = null;
    }
});

app.listen(config.PORT, () => console.log(`GERGOV ENGINE ONLINE // PORT ${config.PORT}`));
