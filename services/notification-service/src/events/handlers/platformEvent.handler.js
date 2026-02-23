/**
 * Unified Event Handler for ALL Platform Events
 * Routes domain-specific events to specialized handlers, then to NotificationEventProcessor
 */

const notificationProcessor = require('../../services/notificationEventProcessor');
const logger = require('../../utils/logger');

// Domain-specific handlers
const debtEventHandler = require('./debtEvent.handler');
const saleEventHandler = require('./saleEvent.handler');
const paymentEventHandler = require('./paymentEvent.handler');
const authEventHandler = require('./authEvent.handler');
const shopEventHandler = require('./shopEvent.handler');
const companyEventHandler = require('./companyEvent.handler');
const subscriptionEventHandler = require('./subscriptionEvent.handler');
const staffEventHandler = require('./staffEvent.handler');
const productEventHandler = require('./productEvent.handler');
const reportEventHandler = require('./reportEvent.handler');

/**
 * Universal event handler that processes ANY event type
 * Routes to domain handlers first, then falls back to generic processor
 */
module.exports = async function handlePlatformEvent(event, routingKey) {
    try {
        const { type, source } = event;

        // DEBUG LOGGING - Show the FULL event object
        console.log(`📥 [DEBUG-NOTIF] Received RAW event:`, JSON.stringify(event, null, 2));

        logger.info(`📥 [${source || 'unknown'}] Received event: ${type || routingKey}`);

        let handled = false;

        // Route to domain-specific handlers based on event type
        if (type && type.startsWith('debt.')) {
            await debtEventHandler(event, routingKey);
            handled = true;
        }

        if (type && type.startsWith('sale.')) {
            await saleEventHandler(event, routingKey);
            handled = true;
        }

        if (type && type.startsWith('payment.')) {
            await paymentEventHandler(event, routingKey);
            handled = true;
        }

        // Route auth and user lifecycle events to authEventHandler
        if (type && (type.startsWith('auth.') || type.startsWith('user.'))) {
            console.log(`🔐 [PlatformHandler] Routing to authEventHandler: ${type}`);
            await authEventHandler(event, routingKey);
            handled = true;
        }

        if (type && type.startsWith('shop.')) {
            await shopEventHandler(event, routingKey);
            handled = true;
        }

        if (type && type.startsWith('department_user.')) {
            await staffEventHandler(event, routingKey);
            handled = true;
        }

        if (type && type.startsWith('company.')) {
            await companyEventHandler(event, routingKey);
            handled = true;
        }

        if (type && type.startsWith('subscription.')) {
            await subscriptionEventHandler(event, routingKey);
            handled = true;
        }

        if (type && (type.startsWith('product.') || type.startsWith('inventory.'))) {
            await productEventHandler(event, routingKey);
            handled = true;
        }

        if (type && type.startsWith('document.')) {
            await reportEventHandler(event, routingKey);
            handled = true;
        }

        // Fallback to generic processor ONLY for unmapped event types
        if (!handled) {
            await notificationProcessor.processEvent(event, routingKey);
        }

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
