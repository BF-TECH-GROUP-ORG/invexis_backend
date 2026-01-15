"use strict";

const mongoose = require("mongoose");
const Notification = require("../../models/Notification");
const notificationQueue = require("../../config/queue");
const logger = require("../../utils/logger");
const { sendSMS } = require("../../channels/sms");

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

        if (type === "debt.cancelled") {
            await handleDebtCancelled(data);
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
    const { debtId, companyId, shopId, hashedCustomerId, customer, totalAmount } = data || {};
    if (!companyId || !debtId) {
        logger.warn("⚠️ debt.created missing required fields");
        return;
    }

    try {
        const { dispatchBroadcastEvent } = require("../../services/dispatcher");

        // Admin Notification (In-App/Push)
        await dispatchBroadcastEvent({
            event: "debt.created",
            data: {
                debtId,
                companyId,
                shopId,
                hashedCustomerId,
                customer,
                customerName: customer?.name || "Customer",
                amount: totalAmount,
                ...data
            },
            companyId,
            templateName: "debt_created",
            scope: "company",
            roles: ["admin", "manager"]
        });

        // Customer SMS
        await sendCustomerSms({
            event: "debt.created.customer",
            templateName: "debt_created",
            companyId,
            phone: customer?.phone,
            payload: {
                debtId,
                amount: totalAmount,
                totalDebt: totalAmount, // Assuming total debt is the amount for new debt
                customerName: customer?.name || "Customer",
                items: "items", // Placeholder or extract from data if available
                companyName: data.companyName || "Invexis"
            }
        });

        logger.info(`✅ Queued debt.created notification for debt ${debtId}`);
    } catch (error) {
        logger.error(`❌ Error dispatching debt.created:`, error.message);
        throw error;
    }
}

async function handleRepaymentCreated(data) {
    const { debtId, repaymentId, companyId, amountPaid, newBalance, customer, hashedCustomerId } = data || {};
    if (!companyId || !debtId) {
        logger.warn("⚠️ debt.repayment.created missing required fields");
        return;
    }

    try {
        const { dispatchBroadcastEvent } = require("../../services/dispatcher");

        // Admin Notification
        await dispatchBroadcastEvent({
            event: "debt.repayment.created",
            data: {
                debtId,
                repaymentId,
                amount: amountPaid,
                remainingBalance: newBalance,
                companyId,
                customerName: customer?.name || "Customer",
                ...data
            },
            companyId,
            templateName: "debt_paid",
            scope: "company",
            roles: ["admin", "manager"]
        });

        // Customer SMS
        await sendCustomerSms({
            event: "debt.repayment.customer",
            templateName: "debt_paid",
            companyId,
            phone: customer?.phone,
            payload: {
                amount: amountPaid,
                debtId,
                customerName: customer?.name || "Customer",
                remainingBalance: newBalance,
                companyName: data.companyName || "Invexis"
            }
        });

        logger.info(`✅ Queued repayment notification for debt ${debtId}`);
    } catch (error) {
        logger.error(`❌ Error dispatching debt.repayment.created:`, error.message);
        throw error;
    }
}

async function handleDebtFullyPaid(data) {
    const { debtId, companyId, totalAmount, customer, hashedCustomerId } = data || {};
    if (!companyId || !debtId) return;

    try {
        const { dispatchBroadcastEvent } = require("../../services/dispatcher");

        // Admin Notification
        await dispatchBroadcastEvent({
            event: "debt.fully_paid",
            data: {
                debtId,
                companyId,
                amount: totalAmount,
                customerName: customer?.name || "Customer",
                remainingBalance: 0,
                ...data
            },
            companyId,
            templateName: "debt_paid", // Reuse paid template
            scope: "company",
            roles: ["admin", "manager"]
        });

        // Customer SMS
        await sendCustomerSms({
            event: "debt.fully_paid.customer",
            templateName: "debt_paid",
            companyId,
            phone: customer?.phone,
            payload: {
                debtId,
                amount: totalAmount,
                customerName: customer?.name || "Customer",
                remainingBalance: 0,
                companyName: data.companyName || "Invexis"
            }
        });

        logger.info(`✅ Queued debt.fully_paid notification for debt ${debtId}`);
    } catch (error) {
        logger.error(`❌ Error dispatching debt.fully_paid:`, error.message);
        throw error;
    }
}

async function handleDebtStatusUpdated(data) {
    const { debtId, status, companyId, customer, amount, totalAmount } = data || {};
    if (!companyId || !debtId) return;

    try {
        const { dispatchBroadcastEvent } = require("../../services/dispatcher");

        await dispatchBroadcastEvent({
            event: "debt.status.updated",
            data: { debtId, status, companyId, ...data },
            companyId,
            templateName: "debt_updated", // Simplified
            scope: "company"
        });

        // Customer SMS if PAID or FULLY_PAID
        // Note: Check for duplicate if 'debt.fully_paid' event is also emitted.
        // Assuming 'debt.status.updated' might be the catch-all for manual updates.
        if (status === 'PAID' || status === 'FULLY_PAID') {
            await sendCustomerSms({
                event: "debt.status.updated.customer",
                templateName: "debt_paid",
                companyId,
                phone: customer?.phone,
                payload: {
                    debtId,
                    status,
                    amount: amount || totalAmount, // amount paid or total? usually status update context implies fully paid if status is designated unique
                    customerName: customer?.name || "Customer",
                    remainingBalance: 0,
                    companyName: data.companyName || "Invexis"
                }
            });
        }

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
            templateName: "debt_created", // Fallback or new reminder template
            scope: "company"
        });

        // Customer SMS reminder (upcoming or overdue)
        const isOverdue = baseEvent === "debt.reminder.overdue";
        await sendCustomerSms({
            event: isOverdue ? "debt.reminder.overdue.customer" : "debt.reminder.upcoming.customer",
            templateName: "debt_created", // Should be a reminder template, reuse created for now or add specific
            companyId,
            phone: data?.customer?.phone,
            payload: {
                amount: data?.balance || data?.totalAmount,
                invoiceId: debtId,
                dueDate: (data?.dueDate && new Date(data.dueDate).toLocaleDateString()) || "",
                customerName: data?.customer?.name || "Customer",
                overdueDays: overdueDays || 0,
                companyName: data.companyName || "Invexis"
            }
        });

        logger.info(`✅ Queued ${type} notification for debt ${debtId}`);
    } catch (error) {
        logger.error(`❌ Error dispatching ${type}:`, error.message);
        throw error;
    }
}

async function handleDebtOverdue(data) {
    const { debtId, companyId, overdueDays, customer, balance, totalAmount, dueDate } = data || {};
    if (!companyId || !debtId) return;

    try {
        const { dispatchBroadcastEvent } = require("../../services/dispatcher");

        await dispatchBroadcastEvent({
            event: "debt.overdue",
            data: { debtId, companyId, overdueDays, ...data },
            companyId,
            templateName: "debt_created", // Ideally 'debt_overdue'
            scope: "company"
        });

        // Customer SMS
        await sendCustomerSms({
            event: "debt.overdue.customer",
            templateName: "debt_created",
            companyId,
            phone: customer?.phone,
            payload: {
                amount: balance || totalAmount,
                invoiceId: debtId,
                dueDate: (dueDate && new Date(dueDate).toLocaleDateString()) || "",
                customerName: customer?.name || "Customer",
                overdueDays,
                companyName: data.companyName || "Invexis"
            }
        });

        logger.info(`✅ Queued debt.overdue notification for debt ${debtId}`);
    } catch (error) {
        logger.error(`❌ Error dispatching debt.overdue:`, error.message);
        throw error;
    }
}

async function handleDebtCancelled(data) {
    const { debtId, companyId, reason, customer, totalAmount, balance } = data || {};
    if (!companyId || !debtId) return;

    try {
        const { dispatchBroadcastEvent } = require("../../services/dispatcher");

        await dispatchBroadcastEvent({
            event: "debt.cancelled",
            data: { debtId, companyId, reason, totalAmount, balance, customer, ...data },
            companyId,
            templateName: "debt_paid", // Means resolved
            scope: "company"
        });

        // Customer SMS
        await sendCustomerSms({
            event: "debt.cancelled.customer",
            templateName: "debt_paid",
            companyId,
            phone: customer?.phone,
            payload: {
                debtId,
                status: "CANCELLED",
                amount: totalAmount || balance || 0,
                customerName: customer?.name || "Customer",
                reason: reason || "",
                companyName: data.companyName || "Invexis"
            }
        });
    } catch (error) {
        logger.error(`❌ Error dispatching debt.cancelled:`, error.message);
        throw error;
    }
}

/**
 * Lightweight helper to send a one-off SMS to a debt customer using the smsTemplates system.
 * Does NOT create a full Notification; it just uses DeliveryLog + SMS channel for external customers.
 */
async function sendCustomerSms({ event, templateName, companyId, phone, payload }) {
    try {
        if (!phone) {
            // logger.warn(`⚠️ Skipping customer SMS for ${event}: phone missing`);
            return;
        }

        const fakeNotification = {
            _id: new mongoose.Types.ObjectId(),
            templateName,
            payload,
            compiledContent: {}, // populated by SMS service hopefully or need pre-compilation?
            title: "",
            body: "",
            channels: { email: false, sms: true, push: false, inApp: false }
        };

        // Note: The SMS channel service usually compiles the template itself using templateName
        const syntheticUserId = new mongoose.Types.ObjectId();
        await sendSMS(fakeNotification, phone, syntheticUserId, companyId);

        logger.info(`✅ Sent customer SMS for ${event} to ${phone}`);
    } catch (err) {
        logger.error(`❌ Failed to send customer SMS for ${event}:`, err.message);
    }
}