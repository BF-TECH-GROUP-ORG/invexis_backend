/**
 * Event Helpers - Debt Service
 * Create outbox events for debt operations
 * All events are created within database transactions for reliability
 */

const mongoose = require('mongoose');

// Outbox Schema for debt service (if not exists)
const OutboxSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        index: true
    },
    exchange: {
        type: String,
        required: true,
        default: 'events_topic'
    },
    routingKey: {
        type: String,
        required: true,
        index: true
    },
    payload: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    published: {
        type: Boolean,
        default: false,
        index: true
    },
    publishedAt: {
        type: Date
    },
    attempts: {
        type: Number,
        default: 0
    },
    lastError: {
        type: String
    }
}, {
    timestamps: true,
    collection: 'outbox'
});

OutboxSchema.index({ published: 1, createdAt: 1 });

// Try to get existing model or create new one
let Outbox;
try {
    Outbox = mongoose.model('Outbox');
} catch {
    Outbox = mongoose.model('Outbox', OutboxSchema);
}

/**
 * Debt Events
 */
const debtEvents = {
    /**
     * Create outbox event for debt creation
     */
    async created(debt, session = null) {
        return await Outbox.create(
            [{
                type: 'debt.created',
                exchange: 'events_topic',
                routingKey: 'debt.created',
                payload: {
                    debtId: debt._id || debt.id,
                    customerId: debt.customerId,
                    companyId: debt.companyId,
                    shopId: debt.shopId,
                    saleId: debt.saleId,
                    amount: debt.amount,
                    amountPaid: debt.amountPaid || 0,
                    balance: debt.balance || debt.amount,
                    status: debt.status || 'pending',
                    dueDate: debt.dueDate,
                    createdAt: new Date().toISOString(),
                    traceId: debt.traceId || require('uuid').v4()
                }
            }],
            { session }
        );
    },

    /**
     * Create outbox event for debt payment received
     */
    async paymentReceived(debtId, payment, session = null) {
        return await Outbox.create(
            [{
                type: 'debt.payment.received',
                exchange: 'events_topic',
                routingKey: 'debt.payment.received',
                payload: {
                    debtId,
                    companyId: payment.companyId,
                    shopId: payment.shopId,
                    paymentId: payment._id || payment.id,
                    amount: payment.amount,
                    paymentMethod: payment.paymentMethod,
                    paidAt: payment.paidAt || new Date().toISOString(),
                    remainingBalance: payment.remainingBalance,
                    traceId: payment.traceId || require('uuid').v4()
                }
            }],
            { session }
        );
    },

    /**
     * Create outbox event for debt settled/paid in full
     */
    async settled(debt, session = null) {
        return await Outbox.create(
            [{
                type: 'debt.settled',
                exchange: 'events_topic',
                routingKey: 'debt.settled',
                payload: {
                    debtId: debt._id || debt.id,
                    companyId: debt.companyId,
                    shopId: debt.shopId,
                    settledAt: new Date().toISOString(),
                    traceId: require('uuid').v4()
                }
            }],
            { session }
        );
    },

    /**
     * Create outbox event for debt overdue
     */
    async overdue(debt, daysOverdue, session = null) {
        return await Outbox.create(
            [{
                type: 'debt.overdue',
                exchange: 'events_topic',
                routingKey: 'debt.overdue',
                payload: {
                    debtId: debt._id || debt.id,
                    companyId: debt.companyId,
                    shopId: debt.shopId,
                    daysOverdue,
                    triggeredAt: new Date().toISOString(),
                    traceId: require('uuid').v4()
                }
            }],
            { session }
        );
    },

    /**
     * Create outbox event for debt updated
     */
    async updated(debt, changes, session = null) {
        return await Outbox.create(
            [{
                type: 'debt.updated',
                exchange: 'events_topic',
                routingKey: 'debt.updated',
                payload: {
                    debtId: debt._id || debt.id,
                    customerId: debt.customerId,
                    companyId: debt.companyId,
                    amount: debt.amount,
                    balance: debt.balance,
                    status: debt.status,
                    changes,
                    updatedAt: new Date().toISOString(),
                    traceId: require('uuid').v4()
                }
            }],
            { session }
        );
    }
};

module.exports = {
    debtEvents,
    Outbox
};
