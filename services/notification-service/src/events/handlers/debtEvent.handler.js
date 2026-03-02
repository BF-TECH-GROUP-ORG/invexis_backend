"use strict";

const mongoose = require("mongoose");
const Notification = require("../../models/Notification");
const notificationQueue = require("../../config/queue");
const logger = require("../../utils/logger");
const { DEPARTMENTS } = require("../../constants/roles");
const { sendSMS } = require("../../channels/sms");
const { cleanValue, cleanAmount, extractField } = require("../../utils/dataSanitizer");

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

        if (type === "debt.repayment.created" || type === "debt.repaid" || type === "debt.payment.received") {
            await handleRepaymentCreated(data);
            return;
        }

        if (type === "debt.fully_paid" || type === "debt.settled") {
            await handleDebtFullyPaid(data);
            return;
        }

        if (type === "debt.marked.paid") {
            await handleDebtMarkedPaid(data);
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
    const { debtId, companyId, shopId, hashedCustomerId, customer, amount, debtDetails, items } = data || {};

    // Robust extraction
    const totalDebt = amount || debtDetails?.totalAmount || data.totalAmount;
    const dueDate = debtDetails?.dueDate || data.dueDate;

    if (!companyId || !debtId) {
        logger.warn("⚠️ debt.created missing required fields");
        return;
    }

    try {
        const { dispatchBroadcastEvent } = require("../../services/dispatcher");

        // Admin/Staff Notification (In-App/Push) - Targeted to SHOP if available
        await dispatchBroadcastEvent({
            event: "debt.created",
            data: {
                debtId,
                companyId,
                shopId,
                hashedCustomerId,
                customer,
                customerName: customer?.name || "Customer",
                amount: totalDebt,
                dueDate,
                shopName: data.shopName || "Our Shop",
                performedByName: data.performedByName || "Staff",
                ...data
            },
            companyId,
            shopId, // Precision: Target specific shop room
            templateName: "debt.created",
            scope: shopId ? "shop" : "department",
            departmentId: DEPARTMENTS.MANAGEMENT,
            roles: ["company_admin", "worker"]
        });

        // Debtor In-App Notification (if system user)
        const debtorId = data.debtorId || data.customerId;
        if (debtorId && debtorId !== 'external' && !debtorId.toString().startsWith('guest_')) {
            const { dispatchEvent } = require("../../services/dispatcher");
            await dispatchEvent({
                event: "debt.created",
                templateName: "debt.created",
                companyId,
                recipients: [debtorId.toString()],
                data: { ...data, customerName: customer?.name || "Customer" }
            });
        }

        // Customer SMS
        const customerPhone = customer?.phone || data.customerPhone || data.phone;
        await sendCustomerSms({
            event: "debt.created.customer",
            templateName: "debt.created",
            companyId,
            phone: customerPhone,
            payload: {
                debtId,
                amount: totalDebt,
                totalDebt: totalDebt,
                dueDate: (dueDate && new Date(dueDate).toLocaleDateString()) || "soon",
                customerName: customer?.name || "Customer",
                items: Array.isArray(items) ? items.map(i => `${i.quantity}x ${i.itemName}`).join(', ') : (items || "items"),
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
    const { debtId, repaymentId, companyId, amountPaid, newBalance, customer, hashedCustomerId, debtDetails } = data || {};

    // Robust extraction
    const safeAmount = cleanAmount(amountPaid || data.amount, 0);
    const safeBalance = cleanAmount(newBalance || data.remainingBalance || data.remainingAmount || data.debtStatus?.newBalance || debtDetails?.balance, 0);
    const safeCustomerName = cleanValue(customer?.name || data.customerName, "Customer");

    if (!companyId || !debtId) {
        logger.warn("⚠️ debt.repayment.created missing required fields");
        return;
    }

    try {
        const { dispatchBroadcastEvent } = require("../../services/dispatcher");

        // Admin/Staff Notification - Targeted to SHOP
        await dispatchBroadcastEvent({
            event: "debt.repayment.created",
            data: {
                debtId,
                repaymentId,
                amount: safeAmount,
                remainingBalance: safeBalance,
                companyId,
                customerName: safeCustomerName,
                shopName: data.shopName || "Our Shop",
                performedByName: data.performedByName || "Staff",
                ...data
            },
            companyId,
            shopId: data.shopId,
            templateName: "debt.payment.received",
            scope: data.shopId ? "shop" : "department",
            departmentId: DEPARTMENTS.MANAGEMENT,
            roles: ["company_admin", "worker"]
        });

        // Debtor In-App Notification (if system user)
        const debtorId = data.debtorId || data.customerId;
        if (debtorId && debtorId !== 'external') {
            const { dispatchEvent } = require("../../services/dispatcher");
            await dispatchEvent({
                event: "debt.payment.received",
                templateName: "debt.payment.received",
                companyId,
                recipients: [debtorId.toString()],
                data: { ...data, amount: safeAmount, remainingBalance: safeBalance }
            });
        }

        // Customer SMS
        const customerPhone = customer?.phone || data.customerPhone || data.phone;
        await sendCustomerSms({
            event: "debt.repayment.customer",
            templateName: "debt.payment.received",
            companyId,
            phone: customerPhone,
            payload: {
                amount: safeAmount,
                debtId,
                customerName: safeCustomerName,
                remainingBalance: safeBalance,
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
    const { debtId, companyId, totalAmount, customer, hashedCustomerId, debtDetails } = data || {};

    // Robust extraction
    const amount = totalAmount || data.amount || debtDetails?.totalAmount || 0;
    const customerPhone = customer?.phone || data.customerPhone || data.phone;

    if (!companyId || !debtId) return;

    try {
        const { dispatchBroadcastEvent } = require("../../services/dispatcher");

        // Admin/Staff Notification - Targeted to SHOP
        await dispatchBroadcastEvent({
            event: "debt.fully_paid",
            data: {
                debtId,
                companyId,
                amount: totalAmount,
                customerName: customer?.name || "Customer",
                remainingBalance: 0,
                shopName: data.shopName || "Our Shop",
                performedByName: data.performedByName || "Staff",
                ...data
            },
            companyId,
            shopId: data.shopId,
            templateName: "debt.fully.paid",
            scope: data.shopId ? "shop" : "company",
            roles: ["company_admin", "worker"]
        });

        // Debtor In-App Notification (if system user)
        const debtorId = data.debtorId || data.customerId;
        if (debtorId && debtorId !== 'external') {
            const { dispatchEvent } = require("../../services/dispatcher");
            await dispatchEvent({
                event: "debt.fully_paid",
                templateName: "debt.fully.paid",
                companyId,
                recipients: [debtorId.toString()],
                data: { ...data, amount: totalAmount }
            });
        }

        // Customer SMS
        await sendCustomerSms({
            event: "debt.fully_paid.customer",
            templateName: "debt.fully.paid",
            companyId,
            phone: customerPhone,
            payload: {
                debtId,
                totalAmount: amount,
                amount: amount, // Template uses 'amount' or 'totalAmount'?
                customerName: customer?.name || "Customer",
                companyName: data.companyName || "Invexis"
            }
        });

        logger.info(`✅ Queued debt.fully_paid notification for debt ${debtId}`);
    } catch (error) {
        logger.error(`❌ Error dispatching debt.fully_paid:`, error.message);
        throw error;
    }
}

async function handleDebtMarkedPaid(data) {
    const { debtId, companyId, totalAmount, amountPaid, customer, hashedCustomerId, debtDetails } = data || {};

    // Robust extraction
    const amount = amountPaid || totalAmount || data.amount || debtDetails?.totalAmount || 0;
    const customerPhone = customer?.phone || data.customerPhone || data.phone;

    if (!companyId || !debtId) return;

    try {
        const { dispatchBroadcastEvent } = require("../../services/dispatcher");

        // Admin Notification
        const safeAmount = cleanAmount(amount || amountPaid || totalAmount || data.amount, 0);
        const safeCustomerName = cleanValue(customer?.name || data.customerName, "Customer");

        await dispatchBroadcastEvent({
            event: "debt.marked.paid",
            data: {
                debtId,
                companyId,
                amount: safeAmount,
                totalAmount: cleanAmount(totalAmount || safeAmount, 0),
                customerName: safeCustomerName,
                remainingBalance: cleanAmount(data.remainingBalance || data.remainingAmount || data.debtStatus?.newBalance || 0, 0),
                ...data
            },
            companyId,
            templateName: "debt.payment.received",
            scope: "department",
            departmentId: DEPARTMENTS.MANAGEMENT,
            roles: ["company_admin", "worker"]
        });

        // Customer SMS
        await sendCustomerSms({
            event: "debt.marked.paid.customer",
            templateName: "debt.payment.received",
            companyId,
            phone: customerPhone,
            payload: {
                debtId,
                amount: safeAmount,
                customerName: safeCustomerName,
                remainingBalance: 0,
                companyName: data.companyName || "Invexis"
            }
        });

        logger.info(`✅ Queued debt.marked.paid notification for debt ${debtId}`);
    } catch (error) {
        logger.error(`❌ Error dispatching debt.marked.paid:`, error.message);
        throw error;
    }
}

async function handleDebtStatusUpdated(data) {
    const { debtId, status, companyId, customer, amount, totalAmount, debtDetails } = data || {};

    // Robust extraction
    const debtAmount = amount || totalAmount || debtDetails?.totalAmount || 0;
    const customerPhone = customer?.phone || data.customerPhone || data.phone;

    if (!companyId || !debtId) return;

    try {
        const { dispatchBroadcastEvent } = require("../../services/dispatcher");

        await dispatchBroadcastEvent({
            event: "debt.status.updated",
            data: {
                debtId,
                status,
                companyId,
                amount: debtAmount,
                customerName: customer?.name || "Customer",
                ...data
            },
            companyId,
            templateName: "debt.status.updated", // Simplified
            scope: "company",
            roles: ["company_admin", "worker"]
        });

        // Customer SMS if PAID or FULLY_PAID
        // Note: EXCLUDE FULLY_PAID if it's already handled by handleDebtFullyPaid
        if (status === 'PAID') {
            await sendCustomerSms({
                event: "debt.status.updated.customer",
                templateName: "debt.payment.received",
                companyId,
                phone: customerPhone,
                payload: {
                    debtId,
                    status,
                    amount: debtAmount,
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
    const { debtId, companyId, daysUntilDue, overdueDays, totalAmount, customer, debtDetails } = data || {};

    // Robust extraction
    const amount = data.balance || totalAmount || debtDetails?.totalAmount || 0;
    const dueDate = data.dueDate || debtDetails?.dueDate;
    const customerPhone = customer?.phone || data.customerPhone || data.phone;

    if (!companyId || !debtId) return;

    try {
        const { dispatchBroadcastEvent } = require("../../services/dispatcher");

        // Map dynamic reminder keys to base event keys for channel mapping
        const isOverdue = type.includes("overdue");
        const baseEvent = isOverdue ? "debt.reminder.overdue" : "debt.reminder.upcoming";
        const reminderTemplate = isOverdue ? "debt.reminder.overdue" : "debt.reminder.upcoming";

        // 1. Admin/Staff Notification (Broadcast)
        await dispatchBroadcastEvent({
            event: baseEvent,
            data: {
                debtId,
                companyId,
                daysUntilDue,
                overdueDays,
                amount,
                customerName: customer?.name || "Customer",
                reminderType: type,
                ...data
            },
            companyId,
            templateName: reminderTemplate,
            scope: "company",
            roles: ["company_admin", "worker"]
        });

        // 2. Customer SMS reminder
        await sendCustomerSms({
            event: isOverdue ? "debt.reminder.overdue.customer" : "debt.reminder.upcoming.customer",
            templateName: reminderTemplate,
            companyId,
            phone: customerPhone,
            payload: {
                amount,
                debtId,
                dueDate: (dueDate && new Date(dueDate).toLocaleDateString()) || "",
                customerName: customer?.name || "Customer",
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
    const { debtId, companyId, overdueDays, customer, balance, totalAmount, dueDate, debtDetails } = data || {};

    // Robust extraction
    const amount = balance || totalAmount || debtDetails?.balance || debtDetails?.totalAmount || 0;
    const customerPhone = customer?.phone || data.customerPhone || data.phone;

    if (!companyId || !debtId) return;

    try {
        const { dispatchBroadcastEvent } = require("../../services/dispatcher");

        await dispatchBroadcastEvent({
            event: "debt.overdue",
            data: {
                debtId,
                companyId,
                overdueDays,
                amount,
                customerName: customer?.name || "Customer",
                ...data
            },
            companyId,
            templateName: "debt.overdue",
            scope: "company",
            roles: ["company_admin", "worker"]
        });

        // Customer SMS
        await sendCustomerSms({
            event: "debt.overdue.customer",
            templateName: "debt.overdue",
            companyId,
            phone: customerPhone,
            payload: {
                debtId,
                amount: amount,
                daysOverdue: overdueDays || 0,
                companyName: data.companyName || "Invexis",
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
    const { debtId, companyId, reason, customer, totalAmount, balance, debtDetails } = data || {};

    // Robust extraction
    const amount = totalAmount || balance || debtDetails?.totalAmount || 0;
    const customerPhone = customer?.phone || data.customerPhone || data.phone;

    if (!companyId || !debtId) return;

    const safeAmount = cleanAmount(amount || totalAmount || balance || data.amount, 0);
    const safeCustomerName = cleanValue(customer?.name || data.customerName, "Customer");

    try {
        const { dispatchBroadcastEvent } = require("../../services/dispatcher");

        await dispatchBroadcastEvent({
            event: "debt.cancelled",
            data: {
                debtId,
                companyId,
                reason: reason || "No reason provided",
                amount: safeAmount,
                customerName: safeCustomerName,
                totalAmount: cleanAmount(totalAmount || safeAmount, 0),
                balance: cleanAmount(balance, 0),
                customer: customer || { name: safeCustomerName },
                ...data
            },
            companyId,
            templateName: "debt.cancelled",
            scope: "department",
            departmentId: DEPARTMENTS.MANAGEMENT,
            roles: ["company_admin", "worker"]
        });

        // Customer SMS
        await sendCustomerSms({
            event: "debt.cancelled.customer",
            templateName: "debt.cancelled",
            companyId,
            phone: customerPhone,
            payload: {
                debtId,
                status: "CANCELLED",
                amount: safeAmount,
                reason: reason || "",
                customerName: safeCustomerName,
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
            logger.warn(`⚠️ Skipping customer SMS for ${event}: phone missing`);
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
        const result = await sendSMS(fakeNotification, phone, syntheticUserId, companyId);

        if (result.success) {
            logger.info(`✅ Sent customer SMS for ${event} to ${phone}`);
        } else {
            logger.warn(`⚠️ Failed to send customer SMS for ${event} to ${phone}: ${result.error || 'Unknown error'}`);
        }
    } catch (err) {
        logger.error(`❌ Failed to send customer SMS for ${event}:`, err.message);
    }
}