// websocket-service/src/config/shared.js
const logger = require('../utils/logger');

let redis, rabbitmq;

// Try to load shared dependencies
try {
  rabbitmq = require('/app/shared/rabbitmq.js');
  redis = require('/app/shared/redis.js');
} catch (err) {
  logger.warn('Shared dependencies not available, running in standalone mode');

  // Stub RabbitMQ client for local/test environments
  rabbitmq = {
    connect: async () => null,
    healthCheck: async () => true,
    subscribe: async () => null,
    exchanges: {
      topic: 'amq.topic',
      dlx: 'amq.dlx',
    },
  };

  // Stub Redis client
  redis = {
    connect: async () => null,
    disconnect: async () => null,
    isConnected: false,
    set: async () => null,
    get: async () => null,
    setex: async () => null,
    exists: async () => 0,
    incr: async () => 1,
    expire: async () => null,
    sadd: async () => null,
    srem: async () => null,
    scard: async () => 0,
    smembers: async () => [],
    keys: async () => [],
    del: async () => null,
  };
}

/**
 * Health check for monitoring
 */
const healthCheck = async () => {
  const health = {
    redis: { status: redis?.isConnected ? 'ok' : 'disconnected' },
    rabbitmq: { status: 'ok' }
  };

  try {
    if (rabbitmq?.healthCheck) {
      const result = await rabbitmq.healthCheck();
      health.rabbitmq.status = result ? 'ok' : 'error';
    }
  } catch (err) {
    logger.error('RabbitMQ health check failed:', err);
    health.rabbitmq.status = 'error';
    health.rabbitmq.error = err.message;
  }

  return health;
};

module.exports = { redis, rabbitmq, healthCheck };