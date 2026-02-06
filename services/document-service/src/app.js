const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const healthRoutes = require('./routes/health');
const logger = require('./config/logger');

const app = express();
app.set('trust proxy', true);

// Middleware
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Routes
const { authenticateToken } = require('/app/shared/middlewares/auth/production-auth');
const { checkSubscriptionStatus } = require('/app/shared/middlewares/subscription/production-subscription');

// Routes
app.use('/health', healthRoutes);
app.use('/document', authenticateToken, checkSubscriptionStatus(), require('./routes/api'));

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error('Unhandled Error', err);
    res.status(500).json({
        status: 'error',
        message: 'Internal Server Error'
    });
});

module.exports = app;
