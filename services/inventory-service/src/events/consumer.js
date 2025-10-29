/**
 * Event Consumer - Consumes events from RabbitMQ
 * Handles registration of consumers and event routing
 */

const { logger } = require('../utils/logger');
const eventConsumersConfig = require('./config/eventConsumers.config');

let channel = null;

/**
 * Register all consumers
 */
async function registerConsumers(ch) {
  try {
    channel = ch;

    // Declare topic exchange
    await channel.assertExchange('events_topic', 'topic', { durable: true });

    // Register each consumer
    for (const [consumerName, config] of Object.entries(eventConsumersConfig)) {
      await registerConsumer(consumerName, config);
    }

    logger.info(`✅ Event consumers registered (${Object.keys(eventConsumersConfig).length} consumers)`);
  } catch (error) {
    logger.error(`❌ Failed to register consumers: ${error.message}`);
    throw error;
  }
}

/**
 * Register a single consumer
 */
async function registerConsumer(name, config) {
  try {
    const { queue, exchange, pattern, handler } = config;

    // Declare queue
    await channel.assertQueue(queue, { durable: true });

    // Bind queue to exchange with pattern
    await channel.bindQueue(queue, exchange, pattern);

    // Consume messages
    await channel.consume(queue, async (msg) => {
      if (msg) {
        try {
          const content = JSON.parse(msg.content.toString());
          logger.info(`📥 Event received: ${content.type || 'unknown'}`);

          // Call handler
          await handler(content);

          // Acknowledge message
          channel.ack(msg);
        } catch (error) {
          logger.error(`❌ Error processing event: ${error.message}`);
          // Nack and requeue
          channel.nack(msg, false, true);
        }
      }
    });

    logger.info(`✅ Consumer registered: ${name} (pattern: ${pattern})`);
  } catch (error) {
    logger.error(`❌ Failed to register consumer ${name}: ${error.message}`);
    throw error;
  }
}

/**
 * Close consumer connection
 */
async function closeConnection() {
  try {
    if (channel) {
      await channel.close();
      logger.info('✅ Consumer channel closed');
    }
  } catch (error) {
    logger.error(`❌ Error closing consumer: ${error.message}`);
  }
}

module.exports = {
  registerConsumers,
  registerConsumer,
  closeConnection
};

