const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');
const { JSDOM } = require('jsdom');
const app = express();
const parser = new Parser();

app.use(cors());

const FEEDS = [
    { name: "BBC", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
    { name: "AL_JAZEERA", url: "https://www.aljazeera.com/xml/rss/all.xml" }
];

app.get('/api/news', async (req, res) => {
    try {
        const feedResults = await Promise.all(FEEDS.map(f => parser.parseURL(f.url).catch(() => ({items: []}))));
        const primaryItems = feedResults[0].items.slice(0, 10);
        const compareItems = feedResults[1].items;

        const results = await Promise.all(primaryItems.map(async (item) => {
            let fullText = "";
            try {
                // Bruteforce selection of common news paragraph containers
                const dom = await JSDOM.fromURL(item.link);
                const pTags = dom.window.document.querySelectorAll('article p, .ssrcss-1q0mxy8-RichTextContainer p, .main-article-body p, [data-component="text-block"] p');
                fullText = Array.from(pTags).map(p => p.textContent).join('\n\n');
            } catch (e) {
                fullText = item.contentSnippet + "\n\n[EXTERNAL_NODE_FETCH_ERROR]";
            }

            const id = Math.random().toString(36).substr(2, 6).toUpperCase();
            let discrepancy = null;

            // Cross-Source Mismatch Logic
            const match = compareItems.find(c => item.title.split(' ').slice(0,3).some(w => c.title.includes(w)));
            if (match) {
                const timeA = new Date(item.pubDate);
                const timeB = new Date(match.pubDate);
                const diff = Math.abs(Math.floor((timeA - timeB) / 60000));
                if (diff > 5) {
                    discrepancy = `TEMPORAL VARIANCE: Primary node (BBC) reports ${timeA.toLocaleTimeString()} vs Secondary node (ALJ) ${timeB.toLocaleTimeString()}. ${diff}m mismatch.`;
                }
            }

            return {
                id,
                node: `GLO-SEC-${id}`,
                source: "BBC WORLD SERVICE",
                title: item.title,
                body: fullText,
                timestamp: new Date(item.pubDate).toLocaleString(),
                discrepancy: discrepancy,
                refs: [
                    { label: "VERIFICATION", val: match ? "DUAL-NODE" : "SINGLE-NODE" },
                    { label: "LATENCY", val: "STABLE" },
                    { label: "GEO_ORIGIN", val: "LONDON_NODE" }
                ]
            };
        }));
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: "FEED_OFFLINE" });
    }
});

app.listen(3000);
