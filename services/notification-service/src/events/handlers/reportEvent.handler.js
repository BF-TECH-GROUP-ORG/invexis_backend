const notificationProcessor = require('../../services/notificationEventProcessor');
const logger = require('../../utils/logger');

/**
 * Report Event Handler
 * Processes document generation events and triggers notifications
 */
module.exports = async function handleReportEvent(event, routingKey) {
    try {
        const { type } = event;

        if (type === 'document.report.created') {
            logger.info(`📝 Processing report delivery for: ${event.data.displayName}`);

            // Map the unified report event to the notification processor
            // We want to notify the owner and potentially branch managers
            const notificationEvent = {
                type: 'NOTIFICATION_REPORT_READY',
                payload: {
                    reportId: event.data.reportId,
                    title: event.data.displayName,
                    url: event.data.url,
                    format: event.data.format,
                    companyId: event.data.owner?.companyId,
                    shopId: event.data.owner?.shopId,
                    context: event.data.context
                }
            };

            await notificationProcessor.processEvent(notificationEvent, 'notification.report.ready');
        }

    } catch (error) {
        logger.error(`❌ Error in report event handler:`, error);
    }
};
