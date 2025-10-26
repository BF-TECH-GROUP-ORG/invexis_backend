require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');
const logger = require('./utils/logger'); // Added for consistent logging
const { shutdownRabbitMQ } = require('./services/reportService'); // Import shutdownRabbitMQ
const { scheduleDailyReport } = require('./services/reportService');

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

const PORT = process.env.PORT || 8007;

const startServer = async () => {
    let retries = 5;
    while (retries > 0) {
        try {
            console.log('Attempting to connect to services...');
            // Connect to MongoDB
            await connectDB();

            // Connect to RabbitMQ
            await connectRabbitMQ()

            await scheduleDailyReport();

            // Connect to Redis
            await redis.connect();
            // Start Express server
            app.listen(PORT, () => {
                console.log(`Auth service running on port ${PORT} - Cached & Event-ready`);
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
    logger.info('Graceful shutdown initiated...');
    try {
        // Close Redis connection
        await redis.quit();
        logger.info('Redis connection closed');

        // Close RabbitMQ connection
        await shutdownRabbitMQ();
        logger.info('RabbitMQ connection closed');

        logger.info('Shutting down server');
        process.exit(0);
    } catch (error) {
        logger.error(`Shutdown error: ${error.message}`);
        process.exit(1);
    }
};

// Start the server
startServer();

// Listen for termination signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);