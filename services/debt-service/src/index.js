require('dotenv').config();
const connectDB = require('./config/db');

let connectRabbitMQ, redis;
let rabbitClient = null;
try {
    // Prefer global shared rabbitmq/redis (mono-repo/container)
    rabbitClient = require('/app/shared/rabbitmq.js');
    connectRabbitMQ = async () => { await rabbitClient.connect(); };
    // adapter: normalize to (routingKey, payload, metadata)
    global.rabbitmqPublish = async (routingKey, payload, metadata = {}) => {
        if (!rabbitClient) throw new Error('RabbitMQ client not available');
        if (rabbitClient.exchanges && rabbitClient.exchanges.topic) {
            return rabbitClient.publish(rabbitClient.exchanges.topic, routingKey, payload, metadata);
        }
        return rabbitClient.publish(routingKey, payload, metadata);
    };
    redis = require('/app/shared/redis.js');
    // expose the connected client to other modules in this process
    global.redisClient = redis;
} catch (err) {
    try {
        // Fallback to local service shared modules
        rabbitClient = require('./shared/rabbitmq');
        connectRabbitMQ = async () => { await rabbitClient.connect(); };
        global.rabbitmqPublish = async (routingKey, payload, metadata = {}) => {
            if (rabbitClient.exchanges && rabbitClient.exchanges.topic) {
                return rabbitClient.publish(rabbitClient.exchanges.topic, routingKey, payload, metadata);
            }
            return rabbitClient.publish(routingKey, payload, metadata);
        };
        redis = require('./shared/redis');
        // expose the connected client to other modules in this process
        global.redisClient = redis;
    } catch (errLocal) {
        // Log the original error to help debug missing-module or execution errors when requiring shared files inside Docker
        console.warn('Shared dependencies not available, falling back to standalone mode. Require error:');
        console.warn((errLocal && errLocal.message) || (err && err.message) || errLocal || err);
        // Provide no-op fallbacks so the service can still start for local/dev scenarios
        connectRabbitMQ = async () => console.log('RabbitMQ connection skipped');
        redis = {
            connect: async () => console.log('Redis connection skipped'),
            quit: async () => console.log('Redis quit skipped')
        };
        // also set global.redisClient to the noop fallback so modules can check it
        global.redisClient = redis;
        global.rabbitmqPublish = async () => console.log('rabbitmq publish skipped');
    }
}

const PORT = process.env.PORT || 8011;

// Validate critical environment variables (mirror auth-service expectations)
const requiredEnvVars = [
    'MONGO_URI',
    'SESSION_SECRET'
];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
    console.error(`Missing environment variables: ${missingEnvVars.join(', ')}`);
    // Do not exit immediately in dev; follow auth-service behavior and exit to surface misconfiguration
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

            // Connect to Redis
            await redis.connect();

            // Start the in-memory persister (drains Redis write queue or local queue)
            try {
                const persister = require('./workers/inMemoryPersister');
                persister.start(100); // every 100ms
                console.log('In-memory persister started');
            } catch (e) {
                console.warn('In-memory persister not started:', e && e.message ? e.message : e);
            }

            // Start Express server (require app after global clients are wired)
            const app = require('./app');
            app.listen(PORT, () => {
                console.log(`debt-service running on port ${PORT} - Cached & Event-ready`);
            });

            // Start cron jobs (schedules). Cron will be a no-op if node-cron isn't available or not desired.
            try {
                const cronJobs = require('./cron');
                cronJobs.start();
                console.log('Cron jobs started successfully');
            } catch (err) {
                console.warn('Cron jobs not started:', err && err.message ? err.message : err);
            }

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

// Graceful shutdown
const shutdown = async () => {
    console.log('Graceful shutdown initiated...');
    try {
        await redis.quit();
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
