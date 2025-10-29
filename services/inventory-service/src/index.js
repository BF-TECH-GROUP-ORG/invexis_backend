require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');
const logger = require('./utils/logger');
const { shutdownRabbitMQ } = require('./services/reportService'); // Fixed import
const { scheduleDailyReport } = require('./services/reportService');




let connectRabbitMQ, redis;

try {
    const rabbitmq = require('/app/shared/rabbitmq.js');
    connectRabbitMQ = rabbitmq.connect; // <-- CORRECT: get connect function
    redis = require('/app/shared/redis.js');
} catch (err) {
    console.warn('Shared dependencies not available, running in standalone mode');
    connectRabbitMQ = async () => console.log('RabbitMQ connection skipped');
    redis = {
        connect: async () => console.log('Redis connection skipped'),
        quit: async () => console.log('Redis quit skipped')
    };
}

const PORT = process.env.PORT || 8007;

const startServer = async () => {
    let retries = 5;
    while (retries > 0) {
        try {
            console.log('Attempting to connect to services...');

            // Connect to MongoDB
            await connectDB();
            console.log('MongoDB connected');

            // Connect to RabbitMQ (shared client)
            await connectRabbitMQ(); // <-- CORRECT: await connect()
            console.log('RabbitMQ connected (shared)');

            // Schedule daily report (test trigger)
            // Remove or comment out in prod if not needed on startup
            // await scheduleDailyReport(1);

            // Connect to Redis
            await redis.connect();
            console.log('Redis connected');

            // Start Express server
            app.listen(PORT, () => {
                console.log(`Report service running on port ${PORT} - Ready`);
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
            await new Promise(r => setTimeout(r, 5000));
        }
    }
};

// === GRACEFUL SHUTDOWN ===
const shutdown = async () => {
    logger.info('Graceful shutdown initiated...');
    try {
        await redis.quit();
        logger.info('Redis connection closed');

        await shutdownRabbitMQ();
        logger.info('RabbitMQ connection closed');

        process.exit(0);
    } catch (error) {
        logger.error(`Shutdown error: ${error.message}`);
        process.exit(1);
    }
};

// === START SERVER ===
startServer();

// === HANDLE TERMINATION ===
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);