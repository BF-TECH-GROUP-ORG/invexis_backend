const rateLimit = require('express-rate-limit');

// Global limiter (like reference: 50 req/min)
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 50,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => process.env.NODE_ENV === 'development' || req.path === '/health',
});

// Stricter for auth (5 req/min)
const authLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 5,
    message: { error: 'Too many auth attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => process.env.NODE_ENV === 'development' || req.path === '/health',
});

module.exports = { limiter, authLimiter };