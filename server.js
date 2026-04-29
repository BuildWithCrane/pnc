const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');
const app = express();
const parser = new Parser();

app.use(cors());

// Sources to compare
const FEEDS = [
    { name: "BBC", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
    { name: "AL_JAZEERA", url: "https://www.aljazeera.com/xml/rss/all.xml" }
];

app.get('/api/news', async (req, res) => {
    try {
        // Fetch all feeds simultaneously
        const feedResults = await Promise.all(FEEDS.map(f => parser.parseURL(f.url).then(res => ({ source: f.name, items: res.items }))));
        
        const allArticles = [];
        const masterList = feedResults[0].items; // Use BBC as the base
        const comparisonList = feedResults[1].items; // Compare against Al Jazeera

        masterList.slice(0, 10).map(item => {
            const id = Math.random().toString(36).substr(2, 6).toUpperCase();
            let findings = [];
            let body = item.contentSnippet || "";

            // LOGIC: Find a matching story in the second source
            // We look for 2+ matching words in the title
            const itemWords = item.title.toLowerCase().split(' ').filter(w => w.length > 4);
            const match = comparisonList.find(c => {
                const matchWords = c.title.toLowerCase().split(' ');
                return itemWords.filter(w => matchWords.includes(w)).length >= 2;
            });

            if (match) {
                // 1. Compare Timestamps
                const timeA = new Date(item.pubDate);
                const timeB = new Date(match.pubDate);
                const timeDiff = Math.abs(Math.floor((timeA - timeB) / 1000 / 60));

                if (timeDiff > 15) {
                    findings.push(`<strong>TEMPORAL MISMATCH</strong>: ${item.source} reports ${timeA.toLocaleTimeString()}, but AL_JAZEERA reports ${timeB.toLocaleTimeString()}. (${timeDiff}m variance)`);
                }

                // 2. Compare Content Density
                if (item.title.length > match.title.length + 20) {
                    findings.push(`<strong>NARRATIVE DISCREPANCY</strong>: Primary source providing significantly more detail than secondary node. Possible suppression or data lag.`);
                }
            } else {
                findings.push(`<strong>ISOLATED REPORT</strong>: No secondary confirmation found across verification nodes. High risk of informational silo.`);
            }

            allArticles.push({
                id: id,
                node: `GLO-SEC-${id}`,
                source: "BBC WORLD",
                title: item.title.toUpperCase(),
                body: body,
                timestamp: new Date(item.pubDate).toISOString().replace('T', ' ').substring(0, 19),
                findings: findings,
                refs: [
                    { label: "Classification", val: "OFFICIAL" },
                    { label: "Verification", val: match ? "DUAL-NODE" : "UNVERIFIED" },
                    { label: "Peer Source", val: match ? "AL_JAZEERA" : "NONE" }
                ]
            });
        });

        res.json(allArticles);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "CROSS_REF_FAIL" });
    }
});

app.listen(3000, () => console.log('GERGOV COMPARATOR ONLINE'));
