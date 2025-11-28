// app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const passport = require('passport');
// Ensure Passport strategies (Google) are loaded and registered
require('./config/passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const cookieParser = require('cookie-parser');
const path = require('path');
const authRoutes = require('./routes/routes');
const { authErrorHandler } = require('./middleware/authMiddleware');
const User = require('./models/User.models');
const Preference = require('./models/Preference.models');
const { hashPassword } = require('./utils/hashPassword');

// Shared dependencies with fallbacks
let redis, connectRabbitMQ, exchanges, publishRabbitMQ;
try {
    redis = require('/app/shared/redis.js');
    const rabbitmq = require('/app/shared/rabbitmq.js');
    connectRabbitMQ = rabbitmq.connect;
    exchanges = rabbitmq.exchanges;
    publishRabbitMQ = rabbitmq.publish;
} catch (err) {
    console.warn('Shared dependencies not available, using mock implementations');
    redis = {
        set: async () => true,
        get: async () => null,
        status: 'ready'
    };
    exchanges = { topic: 'mock.topic' };
    publishRabbitMQ = async () => true;
}

const app = express();

// Validate Google OAuth environment variables
const requiredEnvVars = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
    throw new Error(`Missing Google OAuth environment variables: ${missingEnvVars.join(', ')}`);
}

// ============================================
// PERMISSIVE CORS FOR DEVELOPMENT
// ============================================
app.use((req, res, next) => {
    const origin = req.headers.origin;

    // Allow configured frontend in production; in development echo the request origin
    const allowedFrontend = process.env.FRONTEND_URL || 'http://localhost:3000';
    if (origin) {
        if (process.env.NODE_ENV === 'production') {
            if (origin === allowedFrontend) {
                res.setHeader('Access-Control-Allow-Origin', origin);
            }
        } else {
            // In development accept any origin (useful for ngrok, local frontends, etc.)
            res.setHeader('Access-Control-Allow-Origin', origin);
        }
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', '*');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Access-Control-Expose-Headers', '*');
    }

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    next();
});

// ============================================
// MIDDLEWARE
// ============================================

// Helmet - Security headers (relaxed for development)
app.use(helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: false
}));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Parse cookies so we can read HttpOnly cookies like refreshToken on req.cookies
app.use(cookieParser());

// Logging
app.use(morgan('dev'));

// Session
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to false for development
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    }
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

// ============================================
// ROUTES
// ============================================

// Auth routes
app.use('/auth', authRoutes);

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        const testKey = `health:${Date.now()}`;
        await redis.set(testKey, 'ok', 'EX', 10);
        const cacheOk = (await redis.get(testKey)) === 'ok';
        const eventOk = await publishRabbitMQ(exchanges.topic, 'health.test', { ping: 'pong' });
        const dbOk = (await User.countDocuments({})) >= 0;

        res.json({
            status: (cacheOk && eventOk && dbOk) ? 'healthy' : 'degraded',
            redis: { connected: redis.status === 'ready', test: cacheOk },
            rabbit: { connected: true, test: eventOk },
            db: { connected: true, test: dbOk },
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ status: 'unhealthy', error: err.message });
    }
});

// ============================================
// ERROR HANDLERS
// ============================================

// 404 handler
app.use((req, res) => {
    res.status(404).json({ ok: false, message: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        ok: false,
        message: err.message || 'Internal server error'
    });
});

module.exports = app;