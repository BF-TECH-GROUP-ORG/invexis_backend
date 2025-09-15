const { getChannel } = require('../config/rabbitmq');
const logger = require('../utils/app');

const consumeEvents = async () => {
    const channel = getChannel();
    if (!channel) return;

    channel.consume('auth_events', (msg) => {
        if (msg) {
            const event = JSON.parse(msg.content.toString());
            logger.info('Received event:', event);
            // Process event (e.g., update user status, trigger notifications)
            channel.ack(msg);
        }
    }, { noAck: false });
};

module.exports = consumeEvents;