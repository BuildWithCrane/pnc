const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');
const app = express();
const parser = new Parser();

app.use(cors());

// Definition of what we are looking for and WHY
const intelRules = [
    { regex: /conflict|military|strike|attack/gi, type: 'red', label: 'Security Alert', desc: 'Direct kinetic or security-related event detected.' },
    { regex: /unconfirmed|sources claim|reported/gi, type: 'orange', label: 'Verification Pending', desc: 'Information is unverified by secondary nodes.' },
    { regex: /\d{1,2}:\d{2}/g, type: 'orange', label: 'Temporal Marker', desc: 'Time-sensitive data requires cross-referencing for latency.' }
];

app.get('/api/news', async (req, res) => {
    try {
        const feed = await parser.parseURL('https://feeds.bbci.co.uk/news/world/rss.xml');
        
        const articles = feed.items.map(item => {
            let bodyText = item.contentSnippet || "";
            let findings = [];

            // Apply highlighting and collect explanations
            intelRules.forEach(rule => {
                if (rule.regex.test(bodyText)) {
                    findings.push(`${rule.label}: ${rule.desc}`);
                    bodyText = bodyText.replace(rule.regex, (match) => 
                        `<span class="high-${rule.type}">${match}</span>`
                    );
                }
            });

            return {
                id: Math.random().toString(36).substr(2, 6).toUpperCase(),
                source: "BBC WORLD",
                title: item.title,
                body: bodyText,
                timestamp: new Date(item.pubDate).toLocaleString(),
                findings: findings, // This is the explanation list
                refs: [
                    { label: "Classification", val: "OFFICIAL" },
                    { label: "Reliability", val: findings.length > 0 ? "SCRUTINY REQUIRED" : "STABLE" }
                ]
            };
        });
        res.json(articles);
    } catch (err) {
        res.status(500).json({ error: "FEED_SYNC_ERROR" });
    }
});

app.listen(3000, () => console.log('GERGOV ANALYTICS ONLINE'));
