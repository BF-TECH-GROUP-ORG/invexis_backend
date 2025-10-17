// app.js (Updated with Shared RabbitMQ and Redis Integration)
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

// Shared Modules (from mounted /app/shared)
const { connect: connectRabbitMQ, publish: publishRabbitMQ, exchanges } = require('/app/shared/rabbitmq.js');
const redis = require('/app/shared/redis.js');  // Auto-connects

const app = express();

// Passport setup (unchanged)
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || '464910696321-v7ni53rmm1o4elauuckb6p30i27aub7n.apps.googleusercontent.com',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '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',
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback'
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
                accountStatus: 'active',
                password: await hashPassword(require('crypto').randomBytes(32).toString('hex'))
            });
            await user.save();
            const preference = new Preference({ userId: user._id });
            await preference.save();
            user.preferences = preference._id;
            await user.save();

            // Publish to RabbitMQ using shared module (uncommented and integrated)
            try {
                await publishRabbitMQ(exchanges.topic, 'auth.user.registered', {
                    userId: user._id,
                    email: user.email,
                    event: 'user.registered'
                });
                console.log('Auth-service: User registration event published to RabbitMQ');
            } catch (rabbitErr) {
                console.error('Auth-service: Failed to publish registration event:', rabbitErr.message);
            }

            // Cache user session in Redis using shared module
            try {
                await redis.set(`user:session:${user._id}`, JSON.stringify({
                    userId: user._id,
                    email: user.email,
                    role: user.role
                }), 'EX', 3600);  // 1-hour expiry
                console.log('Auth-service: User session cached in Redis');
            } catch (redisErr) {
                console.error('Auth-service: Failed to cache session in Redis:', redisErr.message);
            }
        }
        done(null, user);
    } catch (err) { done(err); }
}));

passport.serializeUser((user, done) => done(null, user._id));
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) { done(err); }
});

// Middleware (unchanged)
app.use(helmet());
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? process.env.FRONTEND_URL : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use(session({
    secret: process.env.SESSION_SECRET || 'fhkjjflkajflkajdfhbjkabvajkhiowejfiodaojakhfna',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));
app.use(passport.initialize());
app.use(passport.session());

// Rate limiting (unchanged)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later.' }
});
app.use(limiter);

// Serve uploads (unchanged)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes (unchanged)
app.use('/auth', authRoutes);

// Health endpoint with Redis check (enhanced)
app.get('/health', async (req, res) => {
    try {
        const testKey = `health:${Date.now()}`;
        await redis.set(testKey, 'healthy', 'EX', 10);  // Quick set with expiry
        const value = await redis.get(testKey);
        res.json({
            status: 'healthy',
            redisConnected: redis.isConnected,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ error: 'Health check failed - Redis unavailable', details: err.message });
    }
});

// Error handling (unchanged)
app.use(authErrorHandler);
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

module.exports = app;