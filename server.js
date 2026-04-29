const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');
const { JSDOM } = require('jsdom');
const app = express();
const parser = new Parser();

app.use(cors());

// Nodes used for Outlier Verification
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
                const dom = await JSDOM.fromURL(item.link);
                const pTags = dom.window.document.querySelectorAll('article p, .ssrcss-1q0mxy8-RichTextContainer p, .main-article-body p, [data-component="text-block"] p');
                fullText = Array.from(pTags).map(p => p.textContent).join('\n\n');
            } catch (e) {
                fullText = item.contentSnippet + "\n\n[EXTERNAL_NODE_FETCH_ERROR]";
            }

            const id = Math.random().toString(36).substr(2, 6).toUpperCase();
            let discrepancy = null;

            // GERGOV: Outlier Verification Logic
            const match = compareItems.find(c => item.title.split(' ').slice(0,3).some(w => c.title.includes(w)));
            
            if (match) {
                const timeA = new Date(item.pubDate);
                const timeB = new Date(match.pubDate);
                const diff = Math.abs(Math.floor((timeA - timeB) / 60000));
                
                if (diff > 5) {
                    discrepancy = `TEMPORAL OUTLIER: BBC Node timestamp [${timeA.toLocaleTimeString()}] vs Al Jazeera Node [${timeB.toLocaleTimeString()}]. Variance of ${diff}m detected.`;
                }
            } else {
                discrepancy = `SOURCE ISOLATION: Data identified on Primary Node (BBC), but no matching reporting strings found on Verification Node (ALJ).`;
            }

            return {
                id,
                node: `GLO-SEC-${id}`,
                source: "BBC WORLD SERVICE",
                title: item.title.toUpperCase(),
                body: fullText,
                timestamp: new Date(item.pubDate).toLocaleString(),
                discrepancy: discrepancy,
                refs: [
                    { label: "VERIFICATION", val: match ? "DUAL-NODE" : "ISOLATED" },
                    { label: "PEER_SOURCE", val: match ? "AL_JAZEERA_01" : "NONE" },
                    { label: "INTEGRITY", val: discrepancy ? "SCRUTINY_REQUIRED" : "STABLE" }
                ]
            };
        }));
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: "GRID_OFFLINE" });
    }
});

app.listen(3000, () => console.log(`GERGOV ENGINE ONLINE // PORT 3000`));
