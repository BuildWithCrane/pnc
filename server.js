const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');
const { JSDOM } = require('jsdom');
const app = express();
const parser = new Parser();

app.use(cors());

// Multi-Source Comparison List
const FEEDS = [
    { name: "BBC", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
    { name: "AL_JAZEERA", url: "https://www.aljazeera.com/xml/rss/all.xml" }
];

app.get('/api/news', async (req, res) => {
    try {
        const feedResults = await Promise.all(FEEDS.map(f => parser.parseURL(f.url).catch(() => ({items: []}))));
        const primaryItems = feedResults[0].items.slice(0, 8);
        const compareItems = feedResults[1].items;

        const results = await Promise.all(primaryItems.map(async (item) => {
            let advancedText = "";
            try {
                const dom = await JSDOM.fromURL(item.link);
                const pTags = dom.window.document.querySelectorAll('article p, .ssrcss-1q0mxy8-RichTextContainer p');
                // Capture up to 10 paragraphs for "Advanced" mode
                advancedText = Array.from(pTags).map(p => p.textContent).join('\n\n');
            } catch (e) {
                advancedText = item.contentSnippet + "\n\n[Dossier expansion failed at source node.]";
            }

            const id = Math.random().toString(36).substr(2, 6).toUpperCase();
            let findings = [];

            // Cross-Source Logic
            const match = compareItems.find(c => item.title.split(' ').slice(0,3).some(w => c.title.includes(w)));
            if (match) {
                const diff = Math.abs(Math.floor((new Date(item.pubDate) - new Date(match.pubDate)) / 60000));
                if (diff > 10) findings.push(`<strong>TEMPORAL MISMATCH</strong>: Found ${diff}m variance between BBC and Al Jazeera reporting nodes.`);
            }

            return {
                id,
                title: item.title.toUpperCase(),
                standard: advancedText.split('\n\n').slice(0, 2).join('\n\n'), // 2 paragraphs
                advanced: advancedText, // Full text
                findings,
                timestamp: item.pubDate,
                node: `GLO-${id}`
            };
        }));
        res.json(results);
    } catch (err) {
        res.status(500).send("SYNC_ERROR");
    }
});

app.listen(3000);
