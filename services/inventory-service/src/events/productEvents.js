const { getChannel } = require('../config/rabbitmq');
const { logger } = require('../utils/logger');

const publishProductEvent = async (eventType, data) => {
  try {
    const channel = getChannel();
    if (!channel) throw new Error('RabbitMQ channel not initialized');
    const message = JSON.stringify({ eventType, data });
    channel.sendToQueue('product.events', Buffer.from(message), { persistent: true });
    logger.info(`Published product event: ${eventType}`);
  } catch (error) {
    logger.error('Failed to publish product event:', error);
  }
};

module.exports = { publishProductEvent };