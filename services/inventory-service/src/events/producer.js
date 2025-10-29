/**
 * Event Producer - Publishes events to RabbitMQ
 * Handles initialization of publishers and event emission
 */

const { logger } = require('../utils/logger');
const eventPublishersConfig = require('./config/eventPublishers.config');

let channel = null;
let connection = null;

/**
 * Initialize publishers for all configured events
 */
async function initPublishers(ch, conn) {
  try {
    channel = ch;
    connection = conn;

    // Declare topic exchange
    await channel.assertExchange('events_topic', 'topic', { durable: true });

    logger.info(`✅ Event publishers initialized (${Object.keys(eventPublishersConfig).length} events)`);
  } catch (error) {
    logger.error(`❌ Failed to initialize publishers: ${error.message}`);
    throw error;
  }
}

/**
 * Emit event to RabbitMQ
 */
async function emit(routingKey, payload) {
  try {
    if (!channel) {
      throw new Error('Channel not initialized');
    }

    const message = JSON.stringify(payload);
    const published = channel.publish(
      'events_topic',
      routingKey,
      Buffer.from(message),
      { persistent: true, contentType: 'application/json' }
    );

    if (published) {
      logger.info(`📤 Event published: ${routingKey}`);
      return true;
    } else {
      logger.warn(`⚠️ Event queued for retry: ${routingKey}`);
      return false;
    }
  } catch (error) {
    logger.error(`❌ Failed to emit event ${routingKey}: ${error.message}`);
    throw error;
  }
}

/**
 * Get channel (for testing/debugging)
 */
function getChannel() {
  return channel;
}

/**
 * Close connection
 */
async function closeConnection() {
  try {
    if (channel) {
      await channel.close();
      logger.info('✅ Channel closed');
    }
    if (connection) {
      await connection.close();
      logger.info('✅ Connection closed');
    }
  } catch (error) {
    logger.error(`❌ Error closing connection: ${error.message}`);
  }
}

module.exports = {
  initPublishers,
  emit,
  getChannel,
  closeConnection
};

