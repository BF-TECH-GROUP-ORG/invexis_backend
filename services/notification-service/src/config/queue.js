// src/config/queue.js
const Queue = require('bull');
const redis = require('./redis');
const logger = require('../utils/logger');

const notificationQueue = new Queue('notification delivery', {
    redis: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        password: process.env.REDIS_PASSWORD
    }
});

notificationQueue.process(async (job) => {
    // Worker logic in queue/workers.js
    const { deliverNotification } = require('../queue/workers');
    return deliverNotification(job.data);
});

notificationQueue.on('completed', (job) => {
    logger.info(`Job ${job.id} completed`);
});

notificationQueue.on('failed', (job, err) => {
    logger.error(`Job ${job.id} failed:`, err);
});

module.exports = notificationQueue;