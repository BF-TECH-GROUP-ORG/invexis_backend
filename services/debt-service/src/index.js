// src/index.js — FINAL FIX (you WILL see the server running message)
require('dotenv').config();

// Set NODE_OPTIONS for better performance
if (process.env.NODE_ENV === 'production') {
    try {
        require('v8').setFlagsFromString('--max-old-space-size=2048');
    } catch (e) { /* v8 flag setting is optional */ }
}

const app = require('./app');
const connectDB = require('./config/db');
let connectRabbitMQ, redis;
let rabbitmqModule;

// ✅ Import event system
const { initPublishers } = require('./events/producer');
const consumeEvents = require('./events/consumer');

try {
    rabbitmqModule = require('/app/shared/rabbitmq.js');
    connectRabbitMQ = rabbitmqModule.connect;
    redis = require('/app/shared/redis.js');
    // expose a simple global publisher used across the service for best-effort publishes
    global.rabbitmqPublish = async (exchange, routingKey, payload, metadata = {}) => {
        try {
            return await rabbitmqModule.publish(exchange, routingKey, payload, metadata);
        } catch (e) {
            console.warn('global.rabbitmqPublish failed:', e && e.message ? e.message : e);
            return false;
        }
    };
    global.rabbitmqExchanges = rabbitmqModule.exchanges || {};
} catch (err) {
    console.warn('Shared dependencies not available, running in standalone mode');
    connectRabbitMQ = async () => console.log('RabbitMQ connection skipped');
    redis = {
        connect: async () => console.log('Redis connection skipped'),
        quit: async () => console.log('Redis quit skipped')
    };
    // Provide a noop global.rabbitmqPublish so code paths calling it won't crash
    global.rabbitmqPublish = async () => { console.warn('global.rabbitmqPublish called but RabbitMQ not available'); return false; };
    global.rabbitmqExchanges = { topic: 'mock.topic' };
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

            // Initialize internal publisher/consumer helpers (best-effort)
            try {
                if (typeof initPublishers === 'function') {
                    await initPublishers().catch(e => console.warn('initPublishers failed', e && e.message ? e.message : e));
                    console.log('Event publishers initialized');
                }
            } catch (e) { console.warn('initPublishers error', e && e.message ? e.message : e); }

            try {
                if (typeof consumeEvents === 'function') {
                    consumeEvents().catch(e => console.warn('consumeEvents failed', e && e.message ? e.message : e));
                    console.log('Event consumers initialized');
                }
            } catch (e) { console.warn('consumeEvents error', e && e.message ? e.message : e); }

            // Start any internal subscriptions (e.g. listen for sale.debt.request)
            try {
                const subscriberService = require('./services/subscriberService');
                if (subscriberService && typeof subscriberService.start === 'function') {
                    subscriberService.start().catch(e => console.warn('subscriberService start error', e && e.message ? e.message : e));
                }
            } catch (e) { console.warn('No subscriberService available', e && e.message ? e.message : e); }

            // Connect to Redis
            await redis.connect();

            // Start background workers
            console.log('Starting background workers...');
            try {
                const outboxWorker = require('./workers/outboxWorker');
                outboxWorker.start(3000); // Process events every 3 seconds
                console.log('✅ Outbox worker started');
            } catch (e) { console.warn('⚠️ Outbox worker failed to start:', e && e.message ? e.message : e); }

            try {
                const inMemoryPersister = require('./workers/inMemoryPersister');
                inMemoryPersister.start(5000); // Persist every 5 seconds
                console.log('✅ In-memory persister started');
            } catch (e) { console.warn('⚠️ In-memory persister failed to start:', e && e.message ? e.message : e); }

            try {
                const overdueWorker = require('./workers/overdueWorker');
                overdueWorker.start(60000); // Check overdues every 60 seconds
                console.log('✅ Overdue worker started');
            } catch (e) { console.warn('⚠️ Overdue worker failed to start:', e && e.message ? e.message : e); }

            try {
                const reminderWorker = require('./workers/reminderWorker');
                reminderWorker.start(60000); // Check reminders every 60 seconds
                console.log('✅ Reminder worker started');
            } catch (e) { console.warn('⚠️ Reminder worker failed to start:', e && e.message ? e.message : e); }

            // Start Express server
            app.listen(PORT, () => {
                console.log(`\n🚀 Debt service running on port ${PORT}`);
                console.log('✨ Ready to process debts and emit events\n');
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