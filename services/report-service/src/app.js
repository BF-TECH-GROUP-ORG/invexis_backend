const express = require('express');

const helmet = require('helmet');
const morgan = require('morgan');
const healthRoutes = require('./routes/health');
const logger = require('./config/logger');

const app = express();
app.set('trust proxy', 1);

// Middleware
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// 🔒 SECURITY: Rate Limiting
const rateLimit = require("express-rate-limit");
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    validate: { trustProxy: false }
});
app.use(apiLimiter);

// Routes
app.use('/health', healthRoutes);

const { authenticateToken } = require('/app/shared/middlewares/auth/production-auth');
const { checkSubscriptionStatus } = require('/app/shared/middlewares/subscription/production-subscription');

// 🔒 Global Protection for Reports
app.use('/report', authenticateToken, checkSubscriptionStatus(), require('./routes/reports'));

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error('Unhandled Error', err);
    res.status(500).json({
        status: 'error',
        message: 'Internal Server Error'
    });
});

module.exports = app;
