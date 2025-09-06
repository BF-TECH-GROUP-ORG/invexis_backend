const rateLimit = require('express-rate-limit');

// General API rate limiter (all non-sensitive routes)
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests, please try again later.' },
    skip: (req, res) => process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development',
});

// Stricter limiter for sensitive routes (e.g., login, password reset)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many login attempts, please try again later.' },
    skip: (req, res) => process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development',
});

module.exports = {
    generalLimiter,
    authLimiter,
};
