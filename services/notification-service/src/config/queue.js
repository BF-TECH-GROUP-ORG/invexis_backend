// src/config/queue.js
const Queue = require('bull');
const redis = require('/app/shared/redis');
const logger = require('../utils/logger');

// Helper to reuse shared redis client for Bull
const createClient = (type) => {
    switch (type) {
        case 'client':
            return redis.client;
        case 'subscriber':
            return redis.client.duplicate({ maxRetriesPerRequest: null, enableReadyCheck: false });
        case 'bclient':
            return redis.client.duplicate({ maxRetriesPerRequest: null, enableReadyCheck: false });
        default:
            return redis.client.duplicate({ maxRetriesPerRequest: null, enableReadyCheck: false });
    }
};

// Main delivery queue with retry strategies
const notificationQueue = new Queue('notification delivery', {
    createClient,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000 // 5s, 25s, 125s
        },
        removeOnComplete: true, // Keep Redis clean
        removeOnFail: false // Keep failed jobs for inspection or DLQ
    }
});

// Dead Letter Queue for permanently failed notifications
const dlqQueue = new Queue('notification dlq', { createClient });

notificationQueue.on('error', (error) => {
    logger.error('Notification Queue Error:', error);
});

notificationQueue.process('deliver', async (job) => {
    // Worker logic in queue/workers.js
    const { deliverNotification } = require('../queue/workers');
    return deliverNotification(job.data);
});

notificationQueue.on('completed', (job) => {
    logger.info(`Job ${job.id} completed successfully`);
});

notificationQueue.on('failed', async (job, err) => {
    logger.error(`Job ${job.id} failed:`, err.message);

    // If job has exhausted all its attempts, move it to DLQ
    if (job.attemptsMade >= job.opts.attempts) {
        logger.error(`Job ${job.id} permanently failed. Moving to DLQ.`);
        try {
            await dlqQueue.add('failed_notification', {
                originalJobId: job.id,
                notificationId: job.data.notificationId,
                error: err.message,
                failedAt: new Date().toISOString()
            });
            logger.info(`Job ${job.id} successfully moved to DLQ`);
        } catch (dlqErr) {
            logger.error(`Failed to move Job ${job.id} to DLQ:`, dlqErr);
        }
    }
});
notificationQueue.dlqQueue = dlqQueue;
module.exports = notificationQueue;