// src/index.js
const express = require('express');
const knex = require('knex')(require('../knexfile')[process.env.NODE_ENV || 'development']);
const paymentRoutes = require('./routes/paymentRoutes');
const { connect: connectRabbitMQ } = require('/app/shared/rabbitmq');
const redis = require('/app/shared/redis');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 8009;

/* -------------------------- MIDDLEWARE -------------------------- */
// JSON body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// HTTP request logging (Morgan)
if (process.env.NODE_ENV === 'production') {
    app.use(morgan('combined')); // detailed logs for production
} else {
    app.use(morgan('dev')); // concise, colorized logs for development
}

/* --------------------------- ROUTES ----------------------------- */
app.use('/payment', paymentRoutes);

/* --------------------------- HEALTH CHECK ------------------------ */
app.get('/health', async (req, res) => {
    try {
        await knex.raw('SELECT 1');
        await connectRabbitMQ();
        await redis.set('health_test', 'ok', 'EX', 10);
        await redis.del('health_test');

        res.status(200).json({
            status: 'healthy',
            message: 'Payment service connected to PostgresDB, RabbitMQ, Redis'
        });
    } catch (error) {
        console.error('Health check failed:', error.message);
        res.status(503).json({ status: 'unhealthy', message: 'Service unhealthy' });
    }
});

/* -------------------------- SERVER STARTUP ----------------------- */
async function startServer() {
    try {
        await knex.raw('SELECT 1');
        await connectRabbitMQ();
        console.log('✅ Payment service connected to PostgresDB, RabbitMQ, Redis');

        app.listen(PORT, () => {
            console.log(`🚀 Payment service running on port ${PORT}`);
        });
    } catch (error) {
        console.error('❌ Failed to connect to services:', error.message);
        process.exit(1);
    }
}

startServer();

/* ------------------------- GRACEFUL SHUTDOWN ---------------------- */
process.on('SIGINT', async () => {
    console.log('🛑 Shutting down payment service...');
    try {
        await knex.destroy();
        await redis.close();
        console.log('✅ Payment service resources released. Exiting...');
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error.message);
        process.exit(1);
    }
});
