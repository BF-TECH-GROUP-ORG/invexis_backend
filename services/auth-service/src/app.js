// app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const path = require('path');
const authRoutes = require('./routes/authRoutes');
const { authErrorHandler } = require('./middleware/authMiddleware');
const User = require('./models/User.models');
const Preference = require('./models/Preference.models');
const { hashPassword } = require('./utils/hashPassword');

// Shared dependencies
const redis = require('/app/shared/redis.js');
const { connect: connectRabbitMQ, exchanges, publish: publishRabbitMQ } = require('/app/shared/rabbitmq.js');

const app = express();

// Validate Google OAuth environment variables
const requiredEnvVars = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
    throw new Error(`Missing Google OAuth environment variables: ${missingEnvVars.join(', ')}`);
}

// Passport configuration
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
    scope: ['profile', 'email']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ googleId: profile.id });
        if (!user) {
            user = new User({
                googleId: profile.id,
                email: profile.emails[0].value,
                firstName: profile.name.givenName,
                lastName: profile.name.familyName,
                role: 'customer',
                password: await hashPassword(require('crypto').randomBytes(32).toString('hex'))
            });
            await user.save();
            const preference = new Preference({ userId: user._id });
            await preference.save();
            user.preferences = preference._id;
            await user.save();

            // Publish event for external audit service
            await publishRabbitMQ(exchanges.topic, 'auth.user.registered', {
                userId: user._id,
                email: user.email,
                via: 'google'
            }, { headers: { traceId: require('uuid').v4() } });

            // Cache user
            await redis.set(`user:${user._id}`, JSON.stringify(user.toObject({ versionKey: false })), 'EX', 300);
        }
        done(null, user);
    } catch (err) {
        done(err);
    }
}));

// Passport serialize/deserialize
passport.serializeUser((user, done) => {
    done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user || null);
    } catch (err) {
        done(err)
    }
});

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

// Global rate limit
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use(limiter);

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

// Error handling
app.use(authErrorHandler);
app.use((req, res) => res.status(404).json({ ok: false, message: 'Not found' }));

module.exports = app;