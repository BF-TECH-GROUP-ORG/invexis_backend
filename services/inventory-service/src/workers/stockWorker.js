/**
 * Stock Worker
 * Standalone worker for background inventory tasks
 */

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { connect: connectRabbitMQ } = require('/app/shared/rabbitmq');
const { initPublishers } = require('../events/producer');
const AlertCronJobWorker = require('./alertCronJob');
const { getLogger } = require('/app/shared/logger');

const logger = getLogger('stock-worker');

async function start() {
    try {
        logger.info('🚀 Starting Stock Worker...');

        // Connect to database
        await connectDB();
        logger.info('✅ Connected to MongoDB');

        // Initialize RabbitMQ (Required for alerts)
        await connectRabbitMQ();
        await initPublishers();
        await startOutboxDispatcher(10000); // Process outbox every 10 seconds
        logger.info('✅ Connected to RabbitMQ and Outbox Dispatcher started');

        // Start Cron Jobs
        const cronWorker = AlertCronJobWorker.getInstance();
        await cronWorker.initializeAllJobs();

        logger.info('✅ All background monitoring jobs are active');

        // Handle Graceful Shutdown
        process.on('SIGTERM', async () => {
            logger.info('Shutting down Stock Worker...');
            cronWorker.stopAllJobs();
            await mongoose.connection.close();
            process.exit(0);
        });

    } catch (error) {
        logger.error(`❌ Failed to start Stock Worker: ${error.message}`);
        process.exit(1);
    }
}

start();
