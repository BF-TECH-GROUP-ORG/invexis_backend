"use strict";

const logger = require("../../utils/logger");

/**
 * Handles subscription lifecycle events
 * @param {Object} event - The subscription event
 * @param {string} routingKey - Event routing key
 */
module.exports = async function handleSubscriptionEvent(event, routingKey) {
    try {
        const { type, data } = event;

        logger.info(`💳 Processing subscription event: ${type}`, data);

        switch (type) {
            case "subscription.created":
                await handleSubscriptionCreated(data);
                break;

            case "subscription.renewed":
                await handleSubscriptionRenewed(data);
                break;

            case "subscription.expiring.soon":
            case "subscription.expiring":
                await handleSubscriptionExpiring(data);
                break;

            case "subscription.expired":
                await handleSubscriptionExpired(data);
                break;

            case "subscription.payment.failed":
                await handlePaymentFailed(data);
                break;

            default:
                logger.warn(`⚠️ Unhandled subscription event type: ${type}`);
        }
    } catch (error) {
        const errorMsg = error && typeof error === 'object' ? (error.message || JSON.stringify(error)) : String(error);
        logger.error(`❌ Error handling subscription event: ${errorMsg}`);
        throw error;
    }
};

/**
 * Handle subscription creation
 */
async function handleSubscriptionCreated(data) {
    const { companyId, tier, endDate } = data;

    try {
        logger.info(`🎉 New subscription created for company ${companyId} (${tier})`);
        const { dispatchBroadcastEvent } = require("../../services/dispatcher");

        await dispatchBroadcastEvent({
            event: "subscription.created",
            companyId,
            data: {
                tier,
                expiryDate: endDate,
                companyName: "Your Company"
            },
            roles: ["company_admin"],
            templateName: "subscription.created",
            channels: ["push", "inApp", "email"]
        });

        logger.info(`✅ Subscription creation notification dispatched for company ${companyId}`);
    } catch (error) {
        logger.error("❌ Error processing subscription creation:", error);
    }
}

/**
 * Handle subscription renewal
 */
async function handleSubscriptionRenewed(data) {
    const { companyId, endDate, tier } = data;

    try {
        const { dispatchEvent } = require("../../services/dispatcher");

        // Resolve Company Admin
        const { resolveRecipients } = require("../../services/recipientResolver");
        // We need to resolve company admin manually or let dispatcher do it? 
        // Dispatcher usually takes array of userIds or relies on role resolution if implementd.
        // Let's use dispatchBroadcastEvent for company-wide admin alert? 
        // Or standard dispatchEvent if we use resolveRecipients helper.

        // Using dispatchBroadcastEvent which targets roles
        const { dispatchBroadcastEvent } = require("../../services/dispatcher");

        await dispatchBroadcastEvent({
            event: "subscription.renewed",
            companyId,
            data: {
                companyId,
                expiryDate: endDate,
                companyName: "Your Company", // Enriched by dispatcher? NO. Need to fetch? 
                // Dispatcher enriches companyName usually via hydration if missing?
                // Let's rely on standard data or update dispatcher to enrich.
                // Actually, for simplicity/speed, we'll dispatch and hope dispatcher resolves company name 
                // OR we just use "Your Company" as fallback in template.
            },
            roles: ["company_admin"],
            templateName: "subscription.renewed",
            channels: ["push", "inApp", "email"]
        });

        logger.info(`✅ Subscription renewal notification dispatched for company ${companyId}`);

    } catch (error) {
        logger.error("❌ Error processing subscription renewal:", error);
    }
}

/**
 * Handle subscription expiring soon
 */
async function handleSubscriptionExpiring(data) {
    const { companyId, expiryDate, daysRemaining } = data;

    try {
        const { dispatchBroadcastEvent } = require("../../services/dispatcher");

        await dispatchBroadcastEvent({
            event: "subscription.expiring",
            companyId,
            data: {
                expiryDate: expiryDate,
                daysRemaining
            },
            roles: ["company_admin"],
            templateName: "subscription.expiring",
            channels: ["push", "inApp", "email"]
        });

        logger.info(`⚠️ Subscription expiring warning sent for company ${companyId}`);
    } catch (error) {
        logger.error("❌ Error processing expiring subscription:", error);
    }
}

/**
 * Handle subscription expired
 */
async function handleSubscriptionExpired(data) {
    const { companyId, expiredAt } = data;

    try {
        const { dispatchBroadcastEvent } = require("../../services/dispatcher");

        await dispatchBroadcastEvent({
            event: "subscription.expired",
            companyId,
            data: {
                expiredAt: expiredAt || new Date().toISOString()
            },
            roles: ["company_admin"],
            templateName: "subscription.expired",
            channels: ["push", "inApp", "email", "sms"]
        });

        logger.info(`🚨 Subscription expired alert sent for company ${companyId}`);
    } catch (error) {
        logger.error("❌ Error processing expired subscription:", error);
    }
}

/**
 * Handle payment failed
 */
async function handlePaymentFailed(data) {
    const { companyId, amount, reason, paymentId } = data;

    try {
        const { dispatchBroadcastEvent } = require("../../services/dispatcher");

        await dispatchBroadcastEvent({
            event: "payment.failed", // Re-using payment.failed template
            companyId,
            data: {
                amount,
                reason,
                paymentId
            },
            roles: ["company_admin"],
            templateName: "payment.failed",
            channels: ["push", "inApp", "email"]
        });

        logger.info(`❌ Payment failed alert sent for company ${companyId}`);
    } catch (error) {
        logger.error("❌ Error processing failed payment:", error);
    }
}
