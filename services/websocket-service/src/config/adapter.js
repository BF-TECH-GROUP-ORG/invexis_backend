// websocket-service/src/config/adapter.js (new: Redis adapter for scaling)
const { createAdapter } = require('@socket.io/redis-adapter');
const shared = require('./shared');
const logger = require('../utils/logger');

const initAdapter = (io) => {
    // Determine redis clients from the shared module in a defensive way
    let pubClient;
    let subClient;

    const redis = shared.redis;
    if (!redis) throw new Error('Shared redis not available for adapter');

    // Case A: wrapper exposes client and subscriber with duplicate()
    if (redis.client && typeof redis.client.duplicate === 'function' && redis.subscriber && typeof redis.subscriber.duplicate === 'function') {
        pubClient = redis.client.duplicate();
        subClient = redis.subscriber.duplicate();
    } else if (redis.duplicate && typeof redis.duplicate === 'function') {
        // Case B: redis is an ioredis instance
        pubClient = redis.duplicate();
        subClient = redis.duplicate();
    } else if (redis.client && redis.subscriber) {
        // Case C: wrapper that exposes underlying instances without duplicate; assume they are instances
        pubClient = redis.client;
        subClient = redis.subscriber;
    } else {
        logger.warn('Unsupported redis shape for adapter; skipping Socket.IO Redis adapter initialization');
        return;
    }

    try {
        io.adapter(createAdapter(pubClient, subClient));
        logger.info('Socket.IO Redis adapter initialized for clustering');
    } catch (err) {
        logger.error('Failed to create Socket.IO Redis adapter:', err.message);
    }
};

module.exports = { initAdapter };