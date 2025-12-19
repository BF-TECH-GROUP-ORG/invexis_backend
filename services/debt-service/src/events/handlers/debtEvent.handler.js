/**
 * Debt Event Handler
 * Handles DEBT_CREATED, DEBT_REPAID, DEBT_FULLY_PAID events
 * Publishes directly to shared RabbitMQ for other services to consume
 */

const publishToRabbitMQ = async (eventType, payload) => {
    try {
        if (global && typeof global.rabbitmqPublish === 'function') {
            // Use standard event exchange and routing key format
            const routingKey = eventType.toLowerCase().replace(/_/g, '.');
            const exchange = 'debt.events'; // Use shared exchange
            
            console.log(`[DebtEventHandler] 📤 Publishing ${eventType} to exchange="${exchange}", routingKey="${routingKey}"`);
            
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
            eventType: 'DEBT_CREATED',
            debtId,
            companyId,
            shopId,
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
            console.log('[DebtEventHandler] ▶️ DEBT_CREATED payload:', JSON.stringify(enrichedEvent));
        } catch (e) { /* ignore stringify errors */ }

        // Publish to RabbitMQ
        const published = await publishToRabbitMQ('DEBT_CREATED', enrichedEvent);

        if (published) {
            console.log(`[DebtEventHandler] 🎯 Successfully handled DEBT_CREATED event for debt ${debtId}`);
        }

        return enrichedEvent;
    } catch (err) {
        console.error('[DebtEventHandler] Error handling DEBT_CREATED:', err);
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
            createdAt
        } = payload;

        const enrichedEvent = {
            eventType: 'DEBT_REPAID',
            debtId,
            repaymentId,
            companyId,
            shopId,
            paymentDetails: {
                amountPaid,
                paymentMethod,
                paymentReference
            },
            debtStatus: {
                newBalance,
                newStatus
            },
            timestamp: createdAt || new Date()
        };

        const published = await publishToRabbitMQ('DEBT_REPAID', enrichedEvent);
        
        if (published) {
            console.log(`[DebtEventHandler] 🎯 Successfully handled DEBT_REPAID event for repayment ${repaymentId}`);
        }

        return enrichedEvent;
    } catch (err) {
        console.error('[DebtEventHandler] Error handling DEBT_REPAID:', err);
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
            totalAmount,
            fullyPaidAt
        } = payload;

        const enrichedEvent = {
            eventType: 'DEBT_FULLY_PAID',
            debtId,
            companyId,
            shopId,
            debtDetails: {
                totalAmount
            },
            fullyPaidAt: fullyPaidAt || new Date(),
            timestamp: new Date()
        };

        const published = await publishToRabbitMQ('DEBT_FULLY_PAID', enrichedEvent);
        
        if (published) {
            console.log(`[DebtEventHandler] 🎯 Successfully handled DEBT_FULLY_PAID event for debt ${debtId}`);
        }

        return enrichedEvent;
    } catch (err) {
        console.error('[DebtEventHandler] Error handling DEBT_FULLY_PAID:', err);
        throw err;
    }
};

module.exports = {
    handleDebtCreated,
    handleDebtRepaid,
    handleDebtFullyPaid,
    publishToRabbitMQ
};
