// Shared configuration for GERGOV
// Update API_ORIGIN when deploying to a new backend URL

const config = {
    API_ORIGIN: process.env.API_ORIGIN || 'https://gergov-brain.onrender.com/api/news',
    ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || 'https://pnc.gergov.eu/').split(','),
    PORT: parseInt(process.env.PORT || '3000', 10),
    CACHE_TTL_MS: 5 * 60 * 1000,   // 5 minutes
    SCRAPE_TIMEOUT_MS: 8000,
    RATE_LIMIT_MAX: 30,             // requests per minute per IP
};

module.exports = config;
