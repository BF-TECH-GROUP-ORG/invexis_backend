require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');
const consumeEvents = require('./events/consumer');
const { initPublishers } = require('./events/producer');
const { startOutboxDispatcher } = require('./workers/outboxDispatcher');

let connectRabbitMQ, redis;
try {
    const rabbitmq = require('/app/shared/rabbitmq.js');
    connectRabbitMQ = rabbitmq.connect;
    redis = require('/app/shared/redis.js');
} catch (err) {
    // Log the original error to help debug missing-module or execution errors when requiring shared files inside Docker
    console.warn('Shared dependencies not available, falling back to standalone mode. Require error:');
    console.warn(err && err.message ? err.message : err);
    // Provide no-op fallbacks so the service can still start for local/dev scenarios
    connectRabbitMQ = async () => console.log('RabbitMQ connection skipped');
    redis = {
        connect: async () => console.log('Redis connection skipped'),
        quit: async () => console.log('Redis quit skipped')
    };
}

const PORT = process.env.PORT || 8003;

// Validate critical environment variables
const requiredEnvVars = [
    'DB_MONGO'
];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
    console.error(`Missing environment variables: ${missingEnvVars.join(', ')}`);
    process.exit(1);
}

const startServer = async () => {
    let retries = 5;
    while (retries > 0) {
        try {
            console.log('Attempting to connect to services...');
            // Connect to MongoDB
            await connectDB();

            // Connect to RabbitMQ
            await connectRabbitMQ();

            // Initialize Event System
            await consumeEvents();
            await initPublishers();
            await startOutboxDispatcher(5000);

            // Connect to Redis
            await redis.connect();

            // Start Express server
            app.listen(PORT, () => {
                console.log(`audit-service running on port ${PORT} - Cached & Event-ready`);
            });

            return; // Success
        } catch (error) {
            console.error(`Startup attempt failed: ${error.message}`);
            retries--;
            if (retries === 0) {
                console.error('Maximum retries reached. Exiting...');
                process.exit(1);
            }
            console.log(`Retrying in 5 seconds... (${retries} attempts remaining)`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
};

const shutdown = async () => {
    console.log('Graceful shutdown initiated...');
    try {
        await redis.close();
        console.log('Redis connection closed');
        console.log('Shutting down server');
        process.exit(0);
    } catch (error) {
        console.error(`Shutdown error: ${error.message}`);
        process.exit(1);
    }
};

startServer();

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
