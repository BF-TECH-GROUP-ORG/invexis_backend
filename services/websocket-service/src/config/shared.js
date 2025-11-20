// websocket-service/src/config/shared.js
const logger = require('../utils/logger');

let connectRabbitMQ, redis, rabbitmq;

// Try to load shared dependencies
try {
    rabbitmq = require('/app/shared/rabbitmq.js');
    connectRabbitMQ = rabbitmq.connect;
    redis = require('/app/shared/redis.js');
} catch (err) {
    logger.warn('Shared dependencies not available, running in standalone mode');
    connectRabbitMQ = async () => null;
    redis = {
        connect: async () => null,
        quit: async () => null,
        isConnected: false,
        set: async () => null,
        get: async () => null
    };
}

/**
 * Initialize shared services with retries
 */
const initShared = async () => {
    try {
        // Connect to Redis if available
        if (redis && typeof redis.connect === 'function') {
            await redis.connect();
            console.log('redis connected');
        }

        // Connect to RabbitMQ if available
        if (connectRabbitMQ) {
            await connectRabbitMQ();
            const result = await rabbitmq.healthCheck();
            if (result) {
                console.log('rabbitmq connected');
            } else {
                throw new Error('RabbitMQ health check failed');
            }
        }
    } catch (err) {
        logger.error('Failed to initialize shared services:', err);
        throw err;
    }
};

/**
 * Health check for monitoring
 */
const healthCheck = async () => {
    const health = {
        redis: { status: 'unknown' },
        rabbitmq: { status: 'unknown' }
    };

    // Check Redis
    try {
        health.redis.status = redis && redis.isConnected ? 'ok' : 'error';
    } catch (err) {
        health.redis.status = 'error';
        health.redis.error = err.message;
    }

    // Check RabbitMQ (assuming connected if we got this far)
    try {
        health.rabbitmq.status = 'ok';
    } catch (err) {
        health.rabbitmq.status = 'error';
        health.rabbitmq.error = err.message;
    }

    return health;
};

/**
 * Cleanup connections
 */
const cleanup = async () => {
    logger.info('Cleaning up shared connections...');

    try {
        // Close Redis
        if (redis && typeof redis.quit === 'function') {
            await redis.quit();
            logger.info('Redis connection closed');
        }

        logger.info('Shared cleanup completed');
    } catch (err) {
        logger.error('Error during cleanup:', err);
    }
};

module.exports = { redis, rabbitmq: { connect: connectRabbitMQ }, initShared, healthCheck, cleanup };