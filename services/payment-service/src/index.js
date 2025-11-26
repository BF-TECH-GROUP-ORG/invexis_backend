// src/index.js
// Main application entry point

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { db, testConnection, closeConnection } = require('./config/db');
const paymentRoutes = require('./routes/paymentRoutes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 8009;

// Optional: RabbitMQ and Redis
let redis, rabbitmq;
try {
    redis = require('/app/shared/redis');
    rabbitmq = require('/app/shared/rabbitmq');
} catch (error) {
    console.warn('⚠ Shared services (Redis/RabbitMQ) not available');
    redis = null;
    rabbitmq = null;
}

// ==================== Middleware ====================
// Security headers
app.use(helmet());

// CORS configuration
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
}));

// Request logging
app.use(morgan('dev'));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Raw body for webhook signature verification
app.use('/payment/webhooks', express.raw({ type: 'application/json' }), (req, res, next) => {
    req.rawBody = req.body;
    req.body = JSON.parse(req.body.toString());
    next();
});

// ==================== Routes ====================
app.use('/payment', paymentRoutes);

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        service: 'Invexis Payment Service',
        version: '1.0.0',
        status: 'running',
        endpoints: {
            health: '/health',
            payments: '/payment',
            webhooks: '/payment/webhooks',
            invoices: '/payment/invoices',
            reports: '/payment/reports'
        }
    });
});

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        // Test database connection
        await db.raw('SELECT 1');
        const dbStatus = 'connected';

        // Test Redis (if available)
        let redisStatus = 'not_configured';
        if (redis) {
            try {
                await redis.ping();
                redisStatus = 'connected';
            } catch (error) {
                redisStatus = 'disconnected';
            }
        }

        // Test RabbitMQ (if available)
        let rabbitmqStatus = 'not_configured';
        if (rabbitmq) {
            try {
                // Simple check - if module loaded, assume connected
                rabbitmqStatus = 'connected';
            } catch (error) {
                rabbitmqStatus = 'disconnected';
            }
        }

        res.status(200).json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            services: {
                database: dbStatus,
                redis: redisStatus,
                rabbitmq: rabbitmqStatus
            },
            uptime: process.uptime()
        });
    } catch (error) {
        console.error('Health check failed:', error.message);
        res.status(503).json({
            status: 'unhealthy',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ==================== Error Handling ====================
// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// ==================== Server Startup ====================
async function startServer() {
    try {
        // Test database connection
        await testConnection();

        // Connect to RabbitMQ (if available)
        if (rabbitmq && rabbitmq.connect) {
            try {
                await rabbitmq.connect();
                console.log('✓ Connected to RabbitMQ');
            } catch (error) {
                console.warn('⚠ RabbitMQ connection failed:', error.message);
            }
        }

        // Test Redis (if available)
        if (redis) {
            try {
                await redis.ping();
                console.log('✓ Connected to Redis');
            } catch (error) {
                console.warn('⚠ Redis connection failed:', error.message);
            }
        }

        // Start server
        app.listen(PORT, () => {
            console.log('');
            console.log('═══════════════════════════════════════════════════════');
            console.log('  🚀 Invexis Payment Service');
            console.log('═══════════════════════════════════════════════════════');
            console.log(`  ✓ Server running on port ${PORT}`);
            console.log(`  ✓ Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`  ✓ Health check: http://localhost:${PORT}/health`);
            console.log('═══════════════════════════════════════════════════════');
            console.log('');
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
}

// ==================== Graceful Shutdown ====================
const gracefulShutdown = async (signal) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);

    try {
        // Close database connection
        await closeConnection();

        // Close Redis (if available)
        if (redis && redis.quit) {
            await redis.quit();
            console.log('✓ Redis connection closed');
        }

        // Close RabbitMQ (if available)
        if (rabbitmq && rabbitmq.close) {
            await rabbitmq.close();
            console.log('✓ RabbitMQ connection closed');
        }

        console.log('✓ Graceful shutdown complete');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error.message);
        process.exit(1);
    }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start the server
startServer();

module.exports = app;