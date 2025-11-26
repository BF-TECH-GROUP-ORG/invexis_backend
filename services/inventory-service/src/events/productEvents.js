const { publish } = require('/app/shared/rabbitmq');

const publishProductEvent = async (eventType, data) => {
  try {
    // Using default exchange '' and routing key 'product.events' to mimic direct queue send
    await publish('', 'product.events', { eventType, data });
    console.log(`Published product event: ${eventType}`);
  } catch (error) {
    console.error('Failed to publish product event:', error);
  }
};

module.exports = { publishProductEvent };