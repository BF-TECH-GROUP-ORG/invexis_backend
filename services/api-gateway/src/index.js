require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');

const authMiddleware = require('./middleware/authMiddleware');
const errorHandler = require('./utils/errorHandler');
const setupRoutes = require('./routes/routes');
const generalLimiter = require('./utils/rateLimiter').generalLimiter;

const app = express();

// -------------------- Security Middlewares --------------------

// Helmet: secure HTTP headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"], // removed 'unsafe-inline' if possible
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: "same-origin" },
}));

// HSTS: enforce HTTPS
app.use(helmet.hsts({
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
}));

// CORS: restrict origins (adjust FRONTEND_URL/ADMIN_URL in .env)
app.use(cors({
    origin: [
        // process.env.FRONTEND_URL,
        // process.env.ADMIN_URL
        '*'
    ].filter(Boolean), // removes undefined
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}));

// Request logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Parse JSON with size limit
app.use(express.json({ limit: '10mb' }));

// Sanitize input against NoSQL injection & XSS
app.use(mongoSanitize());
app.use(xss());

// Rate limiting to prevent abuse
app.use(generalLimiter);

// // Trust proxy for HTTPS enforcement if behind reverse proxy (NGINX, AWS ELB, etc.)
// app.enable('trust proxy');
// app.use((req, res, next) => {
//     if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
//         return next();
//     }
//     if (process.env.ENFORCE_HTTPS === 'true') {
//         return res.redirect(`https://${req.headers.host}${req.url}`);
//     }
//     next();
// });

// -------------------- App Routes --------------------
// app.use(authMiddleware);
setupRoutes(app);

// Health check route
app.get('/', (req, res) => {
    res.json({ message: 'API Gateway is running' });
});

// -------------------- Error Handler --------------------
app.use(errorHandler);

// -------------------- Server --------------------
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`API Gateway running on port ${PORT}`);
    });
}

module.exports = app;




// remaining 

// TODO: Implement advanced security measures:
// - Restrict CORS to only frontend/admin domains
// - Logging & monitoring (Prometheus + alerts)
// - JWT refresh tokens + rotating secrets
// - Rate limiting per user/account
// - IP blacklisting/whitelisting
// checking and limiting user account not ip 
