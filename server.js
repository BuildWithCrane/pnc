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
                // Heavier scraping to ensure 3+ paragraphs
                const dom = await JSDOM.fromURL(item.link);
                const pTags = dom.window.document.querySelectorAll('article p, .ssrcss-1q0mxy8-RichTextContainer p, .main-article-body p');
                fullText = Array.from(pTags).map(p => p.textContent).join('\n\n');
            } catch (e) {
                fullText = item.contentSnippet + "\n\n[CONTENT_FETCH_FAIL: Node connection timed out.]";
            }

            const id = Math.random().toString(36).substr(2, 6).toUpperCase();
            let findings = [];

            // Mismatch Logic
            const match = compareItems.find(c => item.title.split(' ').slice(0,3).some(w => c.title.includes(w)));
            if (match) {
                const timeA = new Date(item.pubDate);
                const timeB = new Date(match.pubDate);
                const diff = Math.abs(Math.floor((timeA - timeB) / 60000));
                if (diff > 5) {
                    findings.push(`<strong>TEMPORAL MISMATCH</strong>: BBC reported at ${timeA.toLocaleTimeString()}, Al Jazeera reported at ${timeB.toLocaleTimeString()}. Variance: ${diff}m.`);
                }
            }

            return {
                id,
                title: item.title.toUpperCase(),
                body: fullText,
                findings: findings,
                timestamp: item.pubDate,
                node: `NODE-${id}`
            };
        }));
        res.json(results);
    } catch (err) {
        res.status(500).send("TERMINAL_OFFLINE");
    }
});

app.listen(3000, () => console.log('GERGOV_ENGINE_REBOOTED'));
