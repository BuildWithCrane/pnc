const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors()); // This allows your website to talk to this server

// This is a "Mock" list of news. 
// Later, we will replace this with the scraper code.
app.get('/api/news', (req, res) => {
    const data = [
        {
            source: "Reuters",
            topic: "Conflict",
            title: "Peace Talks Scheduled",
            content: "Talks set to begin at 5:00 AM.",
            time: "5:00 AM"
        },
        {
            source: "Source Beta",
            topic: "Conflict",
            title: "Peace Talks Update",
            content: "Negotiators arriving for 6:00 AM start.",
            time: "6:00 AM",
            outlier: "Flag: Temporal mismatch detected (Source Alpha says 5:00 AM)"
        }
    ];
    res.json(data);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Gergov Brain active on port ${PORT}`));
