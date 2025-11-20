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

    const notification = await Notification.create({
        companyId,
        userId: null,
        type: "debt_created",
        title: "New debt recorded",
        body: `A new debt (${debtId}) was created for company ${companyId}`,
        templateName: "debt_created",
        payload: { debtId, companyId, shopId, customerId },
        scope: "company",
        channels: { email: false, sms: false, push: false, inApp: true }
    });

    await notificationQueue.add("deliver", { notificationId: notification._id });
    logger.info(`✅ Queued debt.created notification for debt ${debtId}`);
}

async function handleRepaymentCreated(data) {
    const { debtId, repaymentId, companyId, amountPaid } = data || {};
    if (!companyId || !debtId) {
        logger.warn("⚠️ debt.repayment.created missing required fields");
        return;
    }

    const notification = await Notification.create({
        companyId,
        userId: null,
        type: "debt_repayment",
        title: "Repayment recorded",
        body: `A repayment (${repaymentId || 'unknown'}) was recorded for debt ${debtId}`,
        templateName: "debt_repayment",
        payload: { debtId, repaymentId, amountPaid, companyId },
        scope: "company",
        channels: { email: false, sms: false, push: false, inApp: true }
    });

    await notificationQueue.add("deliver", { notificationId: notification._id });
    logger.info(`✅ Queued repayment notification for debt ${debtId}`);
}

async function handleDebtFullyPaid(data) {
    const { debtId, companyId } = data || {};
    if (!companyId || !debtId) return;

    const notification = await Notification.create({
        companyId,
        userId: null,
        type: "debt_fully_paid",
        title: "Debt fully paid",
        body: `Debt ${debtId} has been fully paid.`,
        templateName: "debt_fully_paid",
        payload: { debtId, companyId },
        scope: "company",
        channels: { email: false, sms: false, push: false, inApp: true }
    });

    await notificationQueue.add("deliver", { notificationId: notification._id });
    logger.info(`✅ Queued debt.fully_paid notification for debt ${debtId}`);
}

async function handleDebtStatusUpdated(data) {
    const { debtId, status, companyId } = data || {};
    if (!companyId || !debtId) return;

    const notification = await Notification.create({
        companyId,
        userId: null,
        type: "debt_status_updated",
        title: `Debt status updated: ${status}`,
        body: `Debt ${debtId} status changed to ${status}.`,
        templateName: "debt_status_updated",
        payload: { debtId, status, companyId },
        scope: "company",
        channels: { email: false, sms: false, push: false, inApp: true }
    });

    await notificationQueue.add("deliver", { notificationId: notification._id });
    logger.info(`✅ Queued debt.status.updated notification for debt ${debtId}`);
}

async function handleDebtReminder(type, data) {
    // Examples: debt.reminder.upcoming.7, debt.reminder.overdue.3, debt.reminder.final, debt.reminder.manual
    const { debtId, companyId, daysUntilDue, overdueDays, totalAmount } = data || {};
    if (!companyId || !debtId) return;

    const title = type.includes("overdue") ? "Debt overdue reminder" : "Debt reminder";
    const body = type.includes("overdue")
        ? `Debt ${debtId} is overdue by ${overdueDays || 'N/A'} days.`
        : `Debt ${debtId} is due in ${daysUntilDue || 'N/A'} days.`;

    const notification = await Notification.create({
        companyId,
        userId: null,
        type: "debt_reminder",
        title,
        body,
        templateName: "debt_reminder",
        payload: { debtId, companyId, daysUntilDue, overdueDays, totalAmount, reminderType: type },
        scope: "company",
        channels: { email: false, sms: false, push: false, inApp: true }
    });

    await notificationQueue.add("deliver", { notificationId: notification._id });
    logger.info(`✅ Queued ${type} notification for debt ${debtId}`);
}

async function handleDebtOverdue(data) {
    const { debtId, companyId, overdueDays } = data || {};
    if (!companyId || !debtId) return;

    const notification = await Notification.create({
        companyId,
        userId: null,
        type: "debt_overdue",
        title: "Debt overdue",
        body: `Debt ${debtId} is overdue by ${overdueDays || 'N/A'} days.`,
        templateName: "debt_overdue",
        payload: { debtId, companyId, overdueDays },
        scope: "company",
        channels: { email: false, sms: false, push: false, inApp: true }
    });

    await notificationQueue.add("deliver", { notificationId: notification._id });
    logger.info(`✅ Queued debt.overdue notification for debt ${debtId}`);
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
