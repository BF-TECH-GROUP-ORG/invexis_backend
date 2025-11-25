const { getChannel } = require('../config/rabbitmq');

const publishProductEvent = async (eventType, data) => {
  try {
    const channel = getChannel();
    if (!channel) throw new Error('RabbitMQ channel not initialized');
    const message = JSON.stringify({ eventType, data });
    channel.sendToQueue('product.events', Buffer.from(message), { persistent: true });
    console.log(`Published product event: ${eventType}`);
  } catch (error) {
    console.error('Failed to publish product event:', error);
  }
};

module.exports = { publishProductEvent };