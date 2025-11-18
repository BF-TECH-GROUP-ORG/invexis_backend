require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
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

// Middleware
app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Routes
app.use('/debt', debtRoutes);
app.use('/events', eventRoutes);

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
        const dbOk = (await metrics.getMetricsText()) !== null;

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