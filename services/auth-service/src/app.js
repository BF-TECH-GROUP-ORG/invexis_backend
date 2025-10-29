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

// Middleware
app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3002',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    }
}));
app.use(passport.initialize());
app.use(passport.session());

// // Global rate limit
// const limiter = rateLimit({
//     windowMs: 600 * 60 * 1000, // 1 hour window
//     max: 1000, // Limit each IP to 1000 requests per hour
//     message: { ok: false, message: 'Too many requests from this IP, please try again after an hour' }
// });
// app.use(limiter);

// Serve static uploads for profile pictures
app.use('/uploads', express.static(path.join(__dirname, '../Uploads')));

// Routes
app.use('/auth', authRoutes);

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        // Test Redis
        const testKey = `health:${Date.now()}`;
        await redis.set(testKey, 'ok', 'EX', 10);
        const cacheOk = (await redis.get(testKey)) === 'ok';

        // Test RabbitMQ
        const eventOk = await publishRabbitMQ(exchanges.topic, 'health.test', { ping: 'pong' });

        // Test MongoDB
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

// Simple 404 handler
app.use((req, res) => {
    res.status(404).json({ ok: false, message: 'Route not found' });
});

module.exports = app;