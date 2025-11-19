// src/index.js — FINAL FIX (you WILL see the server running message)
require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');
let connectRabbitMQ, redis;

try {
    const rabbitmq = require('/app/shared/rabbitmq.js');
    connectRabbitMQ = rabbitmq.connect;
    redis = require('/app/shared/redis.js');
} catch (err) {
    console.warn('Shared dependencies not available, running in standalone mode');
    connectRabbitMQ = async () => console.log('RabbitMQ connection skipped');
    redis = {
        connect: async () => console.log('Redis connection skipped'),
        quit: async () => console.log('Redis quit skipped')
    };
}

const PORT = process.env.PORT || 8005;

// Validate critical environment variables
const requiredEnvVars = [
    'MONGO_URI',
    'SESSION_SECRET'
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

            // Start any internal subscriptions (e.g. listen for sale.debt.request)
            try {
                const subscriberService = require('./services/subscriberService');
                if (subscriberService && typeof subscriberService.start === 'function') {
                    subscriberService.start().catch(e => console.warn('subscriberService start error', e && e.message ? e.message : e));
                }
            } catch (e) { console.warn('No subscriberService available', e && e.message ? e.message : e); }

            // Connect to Redis
            await redis.connect();

            // Start Express server
            app.listen(PORT, () => {
                console.log(`Debt service running on port ${PORT} - Cached & Event-ready`);
            });

            return; // Success - exit the retry loop
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

// Handle graceful shutdown
const shutdown = async () => {
    console.log('Graceful shutdown initiated...');
    try {
        // Close Redis connection
        await redis.quit();
        console.log('Redis connection closed');

        // Close RabbitMQ connection (assumed handled in /app/shared/rabbitmq.js)
        console.log('Shutting down server');
        process.exit(0);
    } catch (error) {
        console.error(`Shutdown error: ${error.message}`);
        process.exit(1);
    }
};

// Start the server
startServer();

// Listen for termination signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);