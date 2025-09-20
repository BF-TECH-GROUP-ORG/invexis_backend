const { getChannel } = require('../config/rabbitmq');
const logger = require('../utils/app');

const publishEvent = async (eventType, data) => {
    const channel = getChannel();
    if (!channel) return;

    const event = { type: eventType, data, timestamp: new Date() };
    channel.sendToQueue('auth_events', Buffer.from(JSON.stringify(event)), { persistent: true });
    logger.info(`Published event: ${eventType}`, data);
};

module.exports = publishEvent;