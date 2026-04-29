const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');
const app = express();
const parser = new Parser();

app.use(cors());

// The Intelligence Ruleset
const intelRules = [
    { regex: /conflict|military|strike|attack|war|fighting/gi, type: 'red', label: 'Security Alert', desc: 'Kinetic or security-related event detected in string.' },
    { regex: /unconfirmed|sources claim|reported|alleged/gi, type: 'orange', label: 'Verification Pending', desc: 'Primary node data is unverified by secondary sources.' },
    { regex: /\d{1,2}:\d{2}/g, type: 'orange', label: 'Temporal Marker', desc: 'Time-sensitive data identified; cross-referencing for latency.' }
];

app.get('/api/news', async (req, res) => {
    try {
        const feed = await parser.parseURL('https://feeds.bbci.co.uk/news/world/rss.xml');
        
        const articles = feed.items.map(item => {
            let bodyText = item.contentSnippet || "";
            let findings = [];

            intelRules.forEach(rule => {
                if (rule.regex.test(bodyText)) {
                    findings.push(`${rule.label}: ${rule.desc}`);
                    bodyText = bodyText.replace(rule.regex, (match) => 
                        `<span class="high-${rule.type}">${match}</span>`
                    );
                }
            });

            const id = Math.random().toString(36).substr(2, 6).toUpperCase();

            return {
                id: id,
                node: `GLO-SEC-${id}`,
                source: "BBC WORLD SERVICE",
                topic: "GEOPOLITICS",
                title: item.title.toUpperCase(),
                summary: item.contentSnippet ? item.contentSnippet.substring(0, 120) + "..." : "",
                body: bodyText,
                timestamp: new Date(item.pubDate).toISOString().replace('T', ' ').substring(0, 19),
                findings: findings,
                refs: [
                    { label: "Classification", val: "OFFICIAL" },
                    { label: "Reliability", val: findings.length > 0 ? "SCRUTINY REQ" : "STABLE" },
                    { label: "System ID", val: `GERG-${id}` }
                ]
            };
        });
        res.json(articles);
    } catch (err) {
        res.status(500).json({ error: "FEED_SYNC_ERROR" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('GERGOV ENGINE ONLINE'));
