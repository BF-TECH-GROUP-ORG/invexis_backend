// websocket-service/src/config/adapter.js
const { createAdapter } = require('@socket.io/redis-adapter');
const shared = require('./shared');
const logger = require('../utils/logger');

const initAdapter = (io) => {
  const redis = shared.redis;
  if (!redis) {
    logger.warn('Redis not available, skipping adapter initialization');
    return;
  }

  try {
    let pubClient, subClient;

    // Handle ioredis instance with duplicate method
    if (typeof redis.duplicate === 'function') {
      pubClient = redis.duplicate();
      subClient = redis.duplicate();
    }
    // Handle wrapper with client/subscriber properties
    else if (redis.client && redis.subscriber) {
      pubClient = redis.client;
      subClient = redis.subscriber;
    }
    // Fallback: use redis directly (for stubs)
    else {
      logger.warn('Redis adapter not available in standalone mode');
      return;
    }

    io.adapter(createAdapter(pubClient, subClient));
    logger.info('Socket.IO Redis adapter initialized');
  } catch (err) {
    logger.error('Failed to initialize Socket.IO adapter:', err.message);
  }
};

module.exports = { initAdapter };