/**
 * Debt Event Handler
 * Handles DEBT_CREATED, DEBT_REPAID, DEBT_FULLY_PAID events
 * Publishes directly to shared RabbitMQ for other services to consume
 */

const { v4: uuidv4 } = require('uuid');

const publishToRabbitMQ = async (eventType, payload) => {
    try {
        if (global && typeof global.rabbitmqPublish === 'function') {
            // Use standard event exchange and routing key format
            const routingKey = eventType.toLowerCase().replace(/_/g, '.');
            const exchange = 'events_topic'; // Use standard hub

            console.log(`[DebtEventHandler] 📤 Publishing ${eventType} to exchange="${exchange}", routingKey="${routingKey}"`);
            console.log(`[DebtEventHandler] 📤 Payload:`, JSON.stringify(payload, null, 2));

            // Publish to RabbitMQ
            await global.rabbitmqPublish(exchange, routingKey, payload);
            console.log(`[DebtEventHandler] ✅ Successfully published ${eventType}`);
            return true;
        } else {
            console.warn('[DebtEventHandler] ⚠️ RabbitMQ not available, event not published');
            return false;
        }
    } catch (err) {
        console.error(`[DebtEventHandler] ❌ Failed to publish ${eventType}:`, err.message);
        return false;
    }
};

/**
 * Handle DEBT_CREATED event
 * Emits enriched event with customer details and debt items
 */
const handleDebtCreated = async (payload) => {
    try {
        const {
            debtId,
            companyId,
            shopId,
            salesStaffId,
            customer,
            items,
            totalAmount,
            balance,
            amountPaidNow,
            status,
            dueDate,
            createdAt,
            createdBy
        } = payload;

        // Enrich event with structured data
        const enrichedEvent = {
            id: uuidv4(), // Unique Event ID
            eventType: 'debt.created', // Standard dot notation
            type: 'debt.created', // Redundant but safe for consumers
            debtId,
            companyId,
            shopId,
            userId: salesStaffId || createdBy?.id, // For "affected user" scoping
            amount: totalAmount, // Clear top-level amount for notifications
            salesStaffId,
            customer: {
                id: customer?.id,
                name: customer?.name,
                phone: customer?.phone
            },
            items: (items || []).map(item => ({
                itemId: item.itemId,
                itemName: item.itemName,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: item.totalPrice
            })),
            debtDetails: {
                totalAmount,
                amountPaidNow,
                balance,
                status,
                dueDate
            },
            audit: {
                createdBy: createdBy ? {
                    id: createdBy.id,
                    name: createdBy.name
                } : null,
                createdAt: createdAt || new Date()
            },
            timestamp: new Date()
        };

        // Log the enriched payload (helps debugging and mirrors inventory service behaviour)
        try {
            console.log('[DebtEventHandler] ▶️ debt.created payload:', JSON.stringify(enrichedEvent));
        } catch (e) { /* ignore stringify errors */ }

        // Publish to RabbitMQ
        const published = await publishToRabbitMQ('debt.created', enrichedEvent);

        if (published) {
            console.log(`[DebtEventHandler] 🎯 Successfully handled debt.created event for debt ${debtId}`);
        }

        return enrichedEvent;
    } catch (err) {
        console.error('[DebtEventHandler] Error handling debt.created:', err);
        throw err;
    }
};

/**
 * Handle DEBT_REPAID event
 * Emits event when a repayment is recorded
 */
const handleDebtRepaid = async (payload) => {
    try {
        const {
            debtId,
            repaymentId,
            companyId,
            shopId,
            amountPaid,
            paymentMethod,
            paymentReference,
            newBalance,
            newStatus,
            createdAt,
            createdBy,
            salesId // ADDED
        } = payload;

        const enrichedEvent = {
            id: uuidv4(),
            eventType: 'debt.repayment.created', // Standard dot notation matching template
            type: 'debt.repayment.created',
            debtId,
            repaymentId,
            companyId,
            shopId,
            salesId,  // ADDED
            userId: createdBy?.id, // For "affected user" scoping
            amount: amountPaid, // Clear top-level amount
            paymentDetails: {
                amountPaid,
                paymentMethod,
                paymentReference
            },
            customer: {
                name: payload.customer?.name,
                phone: payload.customer?.phone,
                email: payload.customer?.email
            },
            debtStatus: {
                newBalance,
                newStatus
            },
            timestamp: createdAt || new Date()
        };

        const published = await publishToRabbitMQ('debt.repayment.created', enrichedEvent);

        if (published) {
            console.log(`[DebtEventHandler] 🎯 Successfully handled debt.repayment.created event for repayment ${repaymentId}`);
        }

        return enrichedEvent;
    } catch (err) {
        console.error('[DebtEventHandler] Error handling debt.repayment.created:', err);
        throw err;
    }
};

/**
 * Handle DEBT_FULLY_PAID event
 * Emits event when entire debt is cleared
 */
const handleDebtFullyPaid = async (payload) => {
    try {
        const {
            debtId,
            companyId,
            shopId,
            salesId,
            totalAmount,
            fullyPaidAt
        } = payload;

        const enrichedEvent = {
            id: uuidv4(),
            eventType: 'debt.fully_paid',
            type: 'debt.fully_paid',
            debtId,
            companyId,
            shopId,
            salesId,
            amount: totalAmount,
            customer: {
                name: payload.customer?.name,
                phone: payload.customer?.phone,
                email: payload.customer?.email
            },
            debtDetails: {
                totalAmount
            },
            fullyPaidAt: fullyPaidAt || new Date(),
            timestamp: new Date()
        };

        const published = await publishToRabbitMQ('debt.fully_paid', enrichedEvent);

        if (published) {
            console.log(`[DebtEventHandler] 🎯 Successfully handled debt.fully_paid event for debt ${debtId}`);
        }

        return enrichedEvent;
    } catch (err) {
        console.error('[DebtEventHandler] Error handling debt.fully_paid:', err);
        throw err;
    }
};

/**
 * Handle DEBT_CANCELLED event
 * Emits event when a debt is cancelled with write-off
 */
const handleDebtCancelled = async (payload) => {
    try {
        const {
            debtId,
            companyId,
            shopId,
            hashedCustomerId,
            customer,
            totalAmount,
            balance,
            reason,
            cancelledBy,
            cancelledAt,
            createdAt
        } = payload;

        const enrichedEvent = {
            id: uuidv4(), // Unique Event ID
            eventType: 'debt.cancelled',
            type: 'debt.cancelled',
            debtId,
            companyId,
            shopId,
            hashedCustomerId,
            customer: {
                id: customer?.id,
                name: customer?.name,
                phone: customer?.phone,
                email: customer?.email
            },
            debtDetails: {
                totalAmount,
                balance,
                cancelReason: reason
            },
            audit: {
                cancelledBy: cancelledBy ? {
                    id: cancelledBy.id || cancelledBy,
                    name: cancelledBy.name || 'Unknown'
                } : null,
                cancelledAt: cancelledAt || new Date()
            },
            timestamp: createdAt || new Date()
        };

        // Log the enriched payload
        try {
            console.log('[DebtEventHandler] ▶️ debt.cancelled payload:', JSON.stringify(enrichedEvent));
        } catch (e) { /* ignore stringify errors */ }

        const published = await publishToRabbitMQ('debt.cancelled', enrichedEvent);

        if (published) {
            console.log(`[DebtEventHandler] 🎯 Successfully handled debt.cancelled event for debt ${debtId}`);
        }

        return enrichedEvent;
    } catch (err) {
        console.error('[DebtEventHandler] Error handling debt.cancelled:', err);
        throw err;
    }
};

/**
 * Handle DEBT_MARKED_AS_PAID event
 * Emits event when a debt is marked as fully paid
 */
const handleDebtMarkedAsPaid = async (payload) => {
    try {
        const {
            debtId,
            companyId,
            shopId,
            salesId,
            hashedCustomerId,
            customer,
            totalAmount,
            amountPaid,
            repaymentId,
            markedAt,
            markedBy,
            createdAt
        } = payload;

        const enrichedEvent = {
            id: uuidv4(),
            eventType: 'debt.marked.paid',
            type: 'debt.marked.paid',
            debtId,
            companyId,
            shopId,
            salesId,
            hashedCustomerId,
            repaymentId,
            amount: totalAmount,
            customer: {
                id: customer?.id,
                name: customer?.name,
                phone: customer?.phone,
                email: customer?.email
            },
            debtDetails: {
                totalAmount,
                amountPaid,
                status: 'PAID'
            },
            audit: {
                markedBy: markedBy ? {
                    id: markedBy.id || markedBy,
                    name: markedBy.name || 'System'
                } : { id: null, name: 'System' },
                markedAt: markedAt || new Date()
            },
            timestamp: createdAt || new Date()
        };

        const published = await publishToRabbitMQ('debt.marked.paid', enrichedEvent);

        if (published) {
            console.log(`[DebtEventHandler] 🎯 Successfully handled debt.marked.paid event for debt ${debtId}`);
        }

        return enrichedEvent;
    } catch (err) {
        console.error('[DebtEventHandler] Error handling debt.marked.paid:', err);
        throw err;
    }
};

module.exports = {
    handleDebtCreated,
    handleDebtRepaid,
    handleDebtFullyPaid,
    handleDebtCancelled,
    handleDebtMarkedAsPaid,
    publishToRabbitMQ
};
