"use strict";

const Notification = require("../../models/Notification");
const notificationQueue = require("../../config/queue");
const logger = require("../../utils/logger");
const { processEventOnce } = require("../../utils/eventDeduplication");

/**
 * Handles ecommerce and order events
 * @param {Object} event - The ecommerce event
 * @param {string} routingKey - Event routing key
 */
module.exports = async function handleEcommerceEvent(event, routingKey) {
    try {
        const { type, payload, data } = event;
        const eventData = payload || data;

        if (!type || !eventData) {
            logger.error('❌ Invalid event structure');
            return;
        }

        const traceId = eventData.traceId || eventData.trace_id;
        const fallbackId = eventData.orderId || eventData.id || '';
        const eventId = traceId || `${type}:${fallbackId}:${Date.now()}`;

        logger.info(`🛒 Processing ecommerce event: ${type}`, { eventId });

        const result = await processEventOnce(
            eventId,
            type,
            async () => {
                switch (type) {
                    case "ecommerce.order.created":
                        return await handleOrderCreated(eventData);

                    case "ecommerce.order.shipped":
                        return await handleOrderShipped(eventData);

                    case "ecommerce.order.delivered":
                        return await handleOrderDelivered(eventData);

                    default:
                        logger.warn(`⚠️ Unhandled ecommerce event type: ${type}`);
                        return null;
                }
            },
            { eventType: type, timestamp: new Date(), orderId: eventData.orderId }
        );

        if (result.duplicate) {
            logger.info(`🔄 Skipped duplicate ecommerce event: ${type}`, { eventId });
        }

    } catch (error) {
        logger.error(`❌ Error handling ecommerce event: ${error.message}`, error);
        throw error;
    }
};

/**
 * Handle order creation
 */
async function handleOrderCreated(data) {
    const { orderId, companyId, total, customerEmail, customerPhone } = data;

    if (!orderId || !companyId) {
        logger.warn("⚠️ Order created event missing required fields");
        return;
    }

    try {
        logger.info(`🛒 New order created: #${orderId} (${total})`);

        const { dispatchBroadcastEvent } = require("../../services/dispatcher");

        await dispatchBroadcastEvent({
            event: "order.created",
            data: {
                ...data,
            },
            companyId,
            templateName: "order.notification",
            channels: ['push', 'inApp', 'email'],
            scope: "company",
            roles: ["company_admin", "worker"]
        });

        logger.info(`✅ Order creation notification broadcasted for order ${orderId}`);
    } catch (error) {
        logger.error(`❌ Error creating order notification:`, error.message);
        throw error;
    }
}

/**
 * Handle order shipped
 */
async function handleOrderShipped(data) {
    const { orderId, companyId, trackingNumber, customerEmail } = data;
    if (!orderId || !companyId) return;

    logger.info(`🚚 Order shipped: #${orderId} (Tracking: ${trackingNumber})`);

    try {
        const { dispatchBroadcastEvent } = require("../../services/dispatcher");

        await dispatchBroadcastEvent({
            event: "order.shipped",
            data: {
                ...data
            },
            companyId,
            templateName: "order.notification",
            channels: ['push', 'inApp'],
            scope: "company",
            roles: ["company_admin", "worker"]
        });
    } catch (err) {
        logger.error(`❌ Error in handleOrderShipped:`, err.message);
    }
}

/**
 * Handle order delivered
 */
async function handleOrderDelivered(data) {
    const { orderId, companyId } = data;
    if (!orderId || !companyId) return;

    logger.info(`📦 Order delivered: #${orderId}`);

    try {
        const { dispatchBroadcastEvent } = require("../../services/dispatcher");

        await dispatchBroadcastEvent({
            event: "order.delivered",
            data: {
                ...data
            },
            companyId,
            templateName: "order.notification",
            channels: ['push', 'inApp'],
            scope: "company",
            roles: ["company_admin", "worker"]
        });
    } catch (err) {
        logger.error(`❌ Error in handleOrderDelivered:`, err.message);
    }
}
