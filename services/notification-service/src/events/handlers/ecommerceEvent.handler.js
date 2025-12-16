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

        const { dispatchEvent } = require("../../services/dispatcher");

        // Determine channels
        const channels = {
            email: !!customerEmail,
            push: true,
            inApp: true,
            sms: !!customerPhone
        };

        await dispatchEvent({
            event: "order.created",
            data: {
                email: customerEmail,
                phone: customerPhone,
                ...data,
            },
            recipients: [data.userId], // Assuming userId is in payload
            companyId,
            templateName: "order_created",
            channels
        });

        logger.info(`✅ Order creation notification dispatched for order ${orderId}`);
    } catch (error) {
        logger.error(`❌ Error creating order notification:`, error.message);
        throw error;
    }
}

/**
 * Handle order shipped
 */
async function handleOrderShipped(data) {
    const { orderId, companyId, trackingNumber } = data;

    logger.info(`🚚 Order shipped: #${orderId} (Tracking: ${trackingNumber})`);
    // Dispatch notification logic here
}

/**
 * Handle order delivered
 */
async function handleOrderDelivered(data) {
    const { orderId, companyId } = data;

    logger.info(`📦 Order delivered: #${orderId}`);
    // Dispatch notification logic here
}
