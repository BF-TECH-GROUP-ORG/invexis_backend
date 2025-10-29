// src/consumers/generalConsumer.js
// General consumer for all notification events
const { subscribe } = require('../config/rabbitmq');
const { dispatchEvent } = require('../services/dispatcher');
const logger = require('../utils/logger');

const startConsumers = async () => {
    // Subscribe to topic exchange for notification events
    await subscribe(
        {
            queue: 'notification_events',
            exchange: 'events_topic',
            pattern: 'auth.*.user.* | payment.* | inventory.*.stock.* | #.tier.*' // Pattern for relevant events
        },
        async (content, routingKey) => {
            logger.info(`Received event: ${routingKey}`, content);
            // Assume content has required fields
            await dispatchEvent({
                event: routingKey,
                data: content.data || content,
                recipients: content.recipients || [content.userId],
                companyId: content.companyId,
                templateName: content.templateName || 'default',
                channels: content.channels || {}
            });
        }
    );
};

module.exports = { startConsumers };