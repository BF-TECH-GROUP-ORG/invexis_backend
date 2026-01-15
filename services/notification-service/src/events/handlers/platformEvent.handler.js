/**
 * Unified Event Handler for ALL Platform Events
 * Uses the enterprise-grade NotificationEventProcessor
 */

const notificationProcessor = require('../../services/notificationEventProcessor');
const logger = require('../../utils/logger');

/**
 * Universal event handler that processes ANY event type
 * The NotificationEventProcessor will check eventChannelMapping and create notifications accordingly
 */
module.exports = async function handlePlatformEvent(event, routingKey) {
    try {
        const { type, source } = event;

        // DEBUG LOGGING
        console.log(`📥 [DEBUG-NOTIF] Received RAW event:`, JSON.stringify({ type, routingKey, source }, null, 2));

        logger.info(`📥 [${source || 'unknown'}] Received event: ${type || routingKey}`);

        // Process event through enterprise notification processor
        await notificationProcessor.processEvent(event, routingKey);

    } catch (error) {
        logger.error(`❌ Error handling platform event:`, {
            error: error.message,
            stack: error.stack,
            event: event?.type,
            routingKey
        });
        // Don't throw - graceful degradation
    }
};
