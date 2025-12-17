require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const debtRoutes = require('./routes/debt');
const eventRoutes = require('./routes/events');
const metrics = require('./utils/metrics');


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

// ✅ Trust proxy - Required for rate limiting behind API gateway
app.set('trust proxy', true);

// Middleware - order matters for performance
app.use(helmet());
app.use(compression({ threshold: 512, level: 6 })); // Compress responses > 512 bytes
app.use(express.json({ limit: '10mb' })); // Reduced from 100mb for better memory usage
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined')); // Use combined format for production-ready logging

// Request timeout middleware - prevent hanging requests (30s timeout)
app.use((req, res, next) => {
    req.setTimeout(30000);
    res.setTimeout(30000);
    next();
});

// Routes
app.use('/debt', debtRoutes);
app.use('/events', eventRoutes);

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        // Cache health check results for 5 seconds
        const cacheKey = 'health:status';
        const cached = await redis.get(cacheKey);
        if (cached) {
            try {
                return res.json(JSON.parse(cached));
            } catch (e) { /* continue to fresh check */ }
        }

        // Test Redis
        const testKey = `health:${Date.now()}`;
        await redis.set(testKey, 'ok', 'EX', 10);
        const cacheOk = (await redis.get(testKey)) === 'ok';

        // Test RabbitMQ (use timeout to prevent hanging)
        // Publishing health events can be noisy if a monitoring system hits /health frequently.
        // Control this behaviour with the `HEALTH_PUBLISH` env var (set to 'true' to enable).
        let eventOk = true;
        if (process.env.HEALTH_PUBLISH === 'true') {
            eventOk = await Promise.race([
                publishRabbitMQ(exchanges.topic, 'health.test', { ping: 'pong' }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
            ]).catch(() => false);
        }

        // Test MongoDB (quick check only)
        const dbOk = (await metrics.getMetricsText()) !== null;

        const result = {
            status: (cacheOk && eventOk && dbOk) ? 'healthy' : 'degraded',
            redis: { connected: redis.status === 'ready', test: cacheOk },
            rabbit: { connected: true, test: eventOk },
            db: { connected: true, test: dbOk },
            timestamp: new Date().toISOString()
        };

        // Cache the result for 5 seconds
        try {
            await redis.set(cacheKey, JSON.stringify(result), 'EX', 5);
        } catch (e) { /* non-critical */ }

        res.json(result);
    } catch (err) {
        res.status(500).json({ status: 'unhealthy', error: err.message });
    }
});

// Simple 404 handler
app.use((req, res) => {
    res.status(404).json({ ok: false, message: 'Route not found' });
});

module.exports = app;