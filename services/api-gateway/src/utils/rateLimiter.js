const rateLimit = require('express-rate-limit');

// Global limiter (Increased to 300 req/min for dev/testing)
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 300,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => process.env.NODE_ENV === 'development' || req.path === '/health' || req.method === 'OPTIONS',
});

// Stricter for auth (Increased to 50 req/min prevent lockouts during active dev)
const authLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 60,
    message: { error: 'Too many auth attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => process.env.NODE_ENV === 'development' || req.path === '/health' || req.method === 'OPTIONS',
});

module.exports = { limiter, authLimiter };