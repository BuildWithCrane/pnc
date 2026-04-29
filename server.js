const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');
const { JSDOM } = require('jsdom');
const app = express();
const parser = new Parser();

app.use(cors());

// Logic to "Scan" text and add highlights based on professional markers
function scanAndHighlight(text) {
    if (!text) return "";
    
    // Red Highlights: Conflict, Crisis, Warning markers
    const redKeywords = [/conflict/gi, /stalled/gi, /crisis/gi, /denied/gi, /warning/gi, /military/gi];
    // Orange Highlights: Temporal or Unverified markers
    const orangeKeywords = [/unconfirmed/gi, /reported/gi, /pending/gi, /\d{1,2}:\d{2}/g, /sources claim/gi];

    let highlighted = text;

    redKeywords.forEach(regex => {
        highlighted = highlighted.replace(regex, (match) => `<span class="high-red">${match}</span>`);
    });

    orangeKeywords.forEach(regex => {
        highlighted = highlighted.replace(regex, (match) => `<span class="high-orange">${match}</span>`);
    });

    return highlighted;
}

app.get('/api/news', async (req, res) => {
    try {
        const feed = await parser.parseURL('https://feeds.bbci.co.uk/news/world/rss.xml');
        
        const articles = feed.items.map(item => {
            const id = Math.random().toString(36).substr(2, 6).toUpperCase();
            
            // We use the snippet provided by the RSS feed for the body
            const rawBody = item.contentSnippet || "No data string available.";
            const processedBody = scanAndHighlight(rawBody);

            return {
                id: id,
                source: "BBC WORLD SERVICE",
                node: `GLO-SEC-${id}`,
                topic: "GEOPOLITICS",
                title: item.title.toUpperCase(),
                summary: item.contentSnippet ? item.contentSnippet.substring(0, 150) + "..." : "",
                body: processedBody,
                timestamp: new Date(item.pubDate).toISOString().replace('T', ' ').substring(0, 19),
                // Only flag a discrepancy if actual "Conflict" keywords were found
                discrepancy: rawBody.toLowerCase().includes('conflict') ? "LATENCY WARNING: Factual divergence detected in local reporting nodes." : null,
                refs: [
                    { label: "Classification", val: "RESTRICTED" },
                    { label: "Reliability", val: rawBody.length > 200 ? "HIGH" : "MEDIUM" },
                    { label: "Internal ID", val: `GERG-${id}` }
                ]
            };
        });
        res.json(articles);
    } catch (err) {
        res.status(500).json({ error: "INTEGRITY_FAIL" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('GERGOV ANALYTICS ONLINE'));
