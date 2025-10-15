// src/index.js (Updated: Mount routes, connect RabbitMQ/Redis)
'use strict';

const express = require('express');
const knex = require('knex')(require('../knexfile')[process.env.NODE_ENV || 'development']);
const paymentRoutes = require('./routes/paymentRoutes');
const { connect: connectRabbitMQ } = require('/app/shared/rabbitmq');
const redis = require('/app/shared/redis');
const app = express();
const PORT = process.env.PORT || 3080;

app.use(express.json());
app.use('/api/v1/payments', paymentRoutes);
app.get('/api/v1', (req, res) => {
    res.status(200).send('Payment Service is running');
})

// Health check (DB + shared services)s
app.get('/health', async (req, res) => {
    try {
        await knex.raw('SELECT 1');
        await connectRabbitMQ();  // Test RabbitMQ
        await redis.set('health_test', 'ok', 'EX', 10);  // Test Redis
        await redis.del('health_test');
        res.status(200).json({ status: 'healthy', message: 'Payment service connected to PostgresDB, RabbitMQ, Redis' });
    } catch (error) {
        console.error('Health check failed:', error.message);
        res.status(503).json({ status: 'unhealthy', message: 'Service unhealthy' });
    }
});

// Startup
async function startServer() {
    try {
        await knex.raw('SELECT 1');
        await connectRabbitMQ();
        console.log('Payment service connected to PostgresDB, RabbitMQ, Redis');
        app.listen(PORT, () => console.log(`Payment service running on port ${PORT}`));
    } catch (error) {
        console.error('Failed to connect to services:', error.message);
        process.exit(1);
    }
}

startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down payment service...');
    await knex.destroy();
    await redis.close();
    process.exit(0);
});