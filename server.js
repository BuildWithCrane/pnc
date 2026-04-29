const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');
const { JSDOM } = require('jsdom'); // Required to "read" the full website
const app = express();
const parser = new Parser();

app.use(cors());

const intelRules = [
    { regex: /conflict|military|strike|attack|war|fighting|missile/gi, type: 'red', label: 'Security Alert', desc: 'Kinetic or security-related event detected in string.' },
    { regex: /unconfirmed|sources claim|reported|alleged|tensions/gi, type: 'orange', label: 'Verification Pending', desc: 'Primary node data is unverified by secondary sources.' },
    { regex: /\d{1,2}:\d{2}/g, type: 'orange', label: 'Temporal Marker', desc: 'Time-sensitive data identified; cross-referencing for latency.' }
];

app.get('/api/news', async (req, res) => {
    try {
        const feed = await parser.parseURL('https://feeds.bbci.co.uk/news/world/rss.xml');
        
        // We only process the top 8 articles to keep the speed fast
        const articlePromises = feed.items.slice(0, 8).map(async (item) => {
            let fullParagraphs = "";
            
            try {
                // Visit the actual news page to get the real content
                const dom = await JSDOM.fromURL(item.link);
                const pTags = dom.window.document.querySelectorAll('article p, .ssrcss-1q0mxy8-RichTextContainer p');
                // Combine the first 4-5 paragraphs to get a substantial "Dossier" feel
                fullParagraphs = Array.from(pTags).slice(0, 5).map(p => p.textContent).join('\n\n');
            } catch (e) {
                fullParagraphs = item.contentSnippet + " [Unable to pull full intelligence string from source node.]";
            }

            let bodyText = fullParagraphs || item.contentSnippet;
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
                title: item.title.toUpperCase(),
                summary: item.contentSnippet,
                body: bodyText,
                timestamp: new Date(item.pubDate).toISOString().replace('T', ' ').substring(0, 19),
                findings: [...new Set(findings)], // Remove duplicates
                refs: [
                    { label: "Classification", val: "OFFICIAL" },
                    { label: "Reliability", val: findings.length > 2 ? "SCRUTINY REQ" : "STABLE" },
                    { label: "System ID", val: `GERG-${id}` }
                ]
            };
        });

        const results = await Promise.all(articlePromises);
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: "FEED_SYNC_ERROR" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('GERGOV DEEP-SCANNER ONLINE'));
