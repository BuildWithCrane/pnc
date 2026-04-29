const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');
const { JSDOM } = require('jsdom');
const app = express();
const parser = new Parser();

app.use(cors());

const intelRules = [
    { regex: /conflict|military|strike|attack|war|fighting|missile|explosion/gi, type: 'red', label: 'Security Alert', desc: 'Kinetic markers identified: ' },
    { regex: /unconfirmed|sources claim|reported|alleged|tensions/gi, type: 'orange', label: 'Verification Pending', desc: 'Unverified linguistic markers: ' },
    { regex: /\d{1,2}:\d{2}/g, type: 'orange', label: 'Temporal Marker', desc: 'Time-sensitive data detected: ' }
];

app.get('/api/news', async (req, res) => {
    try {
        const feed = await parser.parseURL('https://feeds.bbci.co.uk/news/world/rss.xml');
        
        const articlePromises = feed.items.slice(0, 8).map(async (item) => {
            let fullParagraphs = "";
            try {
                const dom = await JSDOM.fromURL(item.link);
                const pTags = dom.window.document.querySelectorAll('article p');
                fullParagraphs = Array.from(pTags).slice(0, 5).map(p => p.textContent).join('\n\n');
            } catch (e) {
                fullParagraphs = item.contentSnippet;
            }

            let bodyText = fullParagraphs;
            let findings = [];

            // BACKING IT UP: Find the exact words that triggered the alert
            intelRules.forEach(rule => {
                const matches = bodyText.match(rule.regex);
                if (matches) {
                    // Create a unique list of the actual words found
                    const uniqueMatches = [...new Set(matches.map(m => m.toLowerCase()))];
                    findings.push(`<strong>${rule.label}</strong>: ${rule.desc} [${uniqueMatches.join(', ')}]`);
                    
                    bodyText = bodyText.replace(rule.regex, (match) => 
                        `<span class="high-${rule.type}">${match}</span>`
                    );
                }
            });

            // SOURCE COMPARISON: Logic-based Latency Check
            const pubDate = new Date(item.pubDate);
            const now = new Date();
            const diffMinutes = Math.floor((now - pubDate) / 1000 / 60);
            
            if (diffMinutes > 60) {
                findings.push(`<strong>Temporal Latency</strong>: Article age (${diffMinutes}m) exceeds "Breaking" threshold. Content may be desynced from live wires.`);
            }

            const id = Math.random().toString(36).substr(2, 6).toUpperCase();

            return {
                id: id,
                node: `GLO-SEC-${id}`,
                source: "BBC WORLD SERVICE",
                title: item.title.toUpperCase(),
                body: bodyText,
                timestamp: pubDate.toISOString().replace('T', ' ').substring(0, 19),
                findings: findings,
                refs: [
                    { label: "Classification", val: "OFFICIAL" },
                    { label: "Reliability", val: diffMinutes < 30 ? "HIGH (LIVE)" : "STALE" },
                    { label: "Latency", val: `${diffMinutes} MIN` }
                ]
            };
        });

        const results = await Promise.all(articlePromises);
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: "FEED_SYNC_ERROR" });
    }
});

app.listen(3000, () => console.log('GERGOV ANALYTICS ONLINE'));
