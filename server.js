const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser'); // Run: npm install rss-parser
const app = express();
const parser = new Parser();

app.use(cors());

app.get('/api/news', async (req, res) => {
    try {
        // Pulling real live news from a stable RSS feed
        const feed = await parser.parseURL('https://feeds.bbci.co.uk/news/world/rss.xml');
        
        const articles = feed.items.map(item => {
            // Simulated Discrepancy Logic (for the demo)
            // In a real version, you'd compare this against a 2nd feed
            const hasConflict = item.title.includes("US") || item.title.includes("EU");

            return {
                id: Math.random().toString(36).substr(2, 9),
                source: "BBC World",
                topic: "Global",
                title: item.title,
                content: item.contentSnippet,
                fullText: item.content || item.contentSnippet + " [Full report available via encrypted node...]",
                time: new Date(item.pubDate).toLocaleTimeString(),
                outlier: hasConflict ? "Temporal mismatch detected in 'Node Beta' reporting timeline." : null,
                references: [
                    { header: "Entity", detail: "Global Governance Body" },
                    { header: "Risk Level", detail: "Tier 2 - Monitoring" }
                ]
            };
        });
        res.json(articles);
    } catch (err) {
        res.status(500).json({ error: "Failed to sync nodes" });
    }
});

app.listen(3000, () => console.log('Gergov Brain Active'));
