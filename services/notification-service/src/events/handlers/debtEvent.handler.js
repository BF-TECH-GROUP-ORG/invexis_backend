"use strict";

const Notification = require("../../models/Notification");
const notificationQueue = require("../../config/queue");
const logger = require("../../utils/logger");

/**
 * Handles debt-related events emitted by debt-service.
 * Normalized event shape: { type: routingKey, data: payload }
 * @param {Object} event
 * @param {string} routingKey
 */
module.exports = async function handleDebtEvent(event, routingKey) {
    try {
        const { type, data } = event;

        logger.info(`🧾 Processing debt event: ${type}`, data || {});

        // Simple routing based on event type / routing key
        if (!type) {
            logger.warn("⚠️ Debt event missing type");
            return;
        }

        if (type === "debt.created") {
            await handleDebtCreated(data);
            return;
        }

        if (type === "debt.repayment.created" || type === "debt.repaid") {
            await handleRepaymentCreated(data);
            return;
        }

        if (type === "debt.fully_paid") {
            await handleDebtFullyPaid(data);
            return;
        }

        if (type === "debt.status.updated") {
            await handleDebtStatusUpdated(data);
            return;
        }

        if (type.startsWith("debt.reminder.")) {
            await handleDebtReminder(type, data);
            return;
        }

        if (type === "debt.overdue") {
            await handleDebtOverdue(data);
            return;
        }

        logger.warn(`⚠️ Unhandled debt event type: ${type}`);
    } catch (error) {
        logger.error(`❌ Error handling debt event: ${error.message}`);
        throw error;
    }
};

async function handleDebtCreated(data) {
    const { debtId, companyId, shopId, customerId } = data || {};
    if (!companyId || !debtId) {
        logger.warn("⚠️ debt.created missing required fields");
        return;
    }

    try {
        const { dispatchBroadcastEvent } = require("../../services/dispatcher");

        await dispatchBroadcastEvent({
            event: "debt.created",
            data: { debtId, companyId, shopId, customerId, ...data },
            companyId,
            templateName: "debt_created",
            scope: "company"
        });

        logger.info(`✅ Queued debt.created notification for debt ${debtId}`);
    } catch (error) {
        logger.error(`❌ Error dispatching debt.created:`, error.message);
        throw error;
    }
}

async function handleRepaymentCreated(data) {
    const { debtId, repaymentId, companyId, amountPaid } = data || {};
    if (!companyId || !debtId) {
        logger.warn("⚠️ debt.repayment.created missing required fields");
        return;
    }

    try {
        const { dispatchBroadcastEvent } = require("../../services/dispatcher");

        await dispatchBroadcastEvent({
            event: "debt.repayment.created",
            data: { debtId, repaymentId, amountPaid, companyId, ...data },
            companyId,
            templateName: "debt_repayment",
            scope: "company"
        });

        logger.info(`✅ Queued repayment notification for debt ${debtId}`);
    } catch (error) {
        logger.error(`❌ Error dispatching debt.repayment.created:`, error.message);
        throw error;
    }
}

async function handleDebtFullyPaid(data) {
    const { debtId, companyId } = data || {};
    if (!companyId || !debtId) return;

    try {
        const { dispatchBroadcastEvent } = require("../../services/dispatcher");

        await dispatchBroadcastEvent({
            event: "debt.fully_paid",
            data: { debtId, companyId, ...data },
            companyId,
            templateName: "debt_fully_paid",
            scope: "company"
        });

        logger.info(`✅ Queued debt.fully_paid notification for debt ${debtId}`);
    } catch (error) {
        logger.error(`❌ Error dispatching debt.fully_paid:`, error.message);
        throw error;
    }
}

async function handleDebtStatusUpdated(data) {
    const { debtId, status, companyId } = data || {};
    if (!companyId || !debtId) return;

    try {
        const { dispatchBroadcastEvent } = require("../../services/dispatcher");

        await dispatchBroadcastEvent({
            event: "debt.status.updated",
            data: { debtId, status, companyId, ...data },
            companyId,
            templateName: "debt_status_updated",
            scope: "company"
        });

        logger.info(`✅ Queued debt.status.updated notification for debt ${debtId}`);
    } catch (error) {
        logger.error(`❌ Error dispatching debt.status.updated:`, error.message);
        throw error;
    }
}

async function handleDebtReminder(type, data) {
    // Examples: debt.reminder.upcoming.7, debt.reminder.overdue.3, debt.reminder.final
    const { debtId, companyId, daysUntilDue, overdueDays, totalAmount } = data || {};
    if (!companyId || !debtId) return;

    try {
        const { dispatchBroadcastEvent } = require("../../services/dispatcher");

        // Map dynamic reminder keys to base event keys for channel mapping
        let baseEvent = "debt.reminder.upcoming";
        if (type.includes("overdue")) {
            baseEvent = "debt.reminder.overdue";
        }

        await dispatchBroadcastEvent({
            event: baseEvent,
            data: { debtId, companyId, daysUntilDue, overdueDays, totalAmount, reminderType: type, ...data },
            companyId,
            templateName: "debt_reminder",
            scope: "company"
        });

        logger.info(`✅ Queued ${type} notification for debt ${debtId}`);
    } catch (error) {
        logger.error(`❌ Error dispatching ${type}:`, error.message);
        throw error;
    }
}

async function handleDebtOverdue(data) {
    const { debtId, companyId, overdueDays } = data || {};
    if (!companyId || !debtId) return;

    try {
        const { dispatchBroadcastEvent } = require("../../services/dispatcher");

        await dispatchBroadcastEvent({
            event: "debt.overdue",
            data: { debtId, companyId, overdueDays, ...data },
            companyId,
            templateName: "debt_overdue",
            scope: "company"
        });

        logger.info(`✅ Queued debt.overdue notification for debt ${debtId}`);
    } catch (error) {
        logger.error(`❌ Error dispatching debt.overdue:`, error.message);
        throw error;
    }
}

async function handleDebtUpdated(data) {
    const { debtId, companyId, changes } = data || {};
    if (!companyId || !debtId) return;

    const notification = await Notification.create({
        companyId,
        userId: null,
        type: "debt_updated",
        title: "Debt updated",
        body: `Debt ${debtId} was updated. Changes: ${Array.isArray(changes) ? changes.join(', ') : JSON.stringify(changes)}`,
        templateName: "debt_updated",
        payload: { debtId, companyId, changes },
        scope: "company",
        channels: { email: false, sms: false, push: false, inApp: true }
    });

    await notificationQueue.add("deliver", { notificationId: notification._id });
    logger.info(`✅ Queued debt.updated notification for debt ${debtId}`);
}

async function handleDebtDeleted(data) {
    const { debtId, companyId, deletedAt } = data || {};
    if (!companyId || !debtId) return;

    const notification = await Notification.create({
        companyId,
        userId: null,
        type: "debt_deleted",
        title: "Debt deleted",
        body: `Debt ${debtId} was deleted${deletedAt ? ' at ' + deletedAt : ''}.`,
        templateName: "debt_deleted",
        payload: { debtId, companyId, deletedAt },
        scope: "company",
        channels: { email: false, sms: false, push: false, inApp: true }
    });

    await notificationQueue.add("deliver", { notificationId: notification._id });
    logger.info(`✅ Queued debt.deleted notification for debt ${debtId}`);
}
