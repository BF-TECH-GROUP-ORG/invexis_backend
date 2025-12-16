/*
 Subscriber service: listens for sale.debt.request messages and responds with a SALE_DEBT_RESPONSE
 Durable flow: enqueue event via inMemoryStore.enqueueEvent (persisted by persister) and best-effort publish via global.rabbitmqPublish
*/
const { isValidHashedCustomerId } = require('../utils/hashedId');

async function start() {
    try {
        const rabbit = require('/app/shared/rabbitmq.js');
        if (!rabbit) return;
        const exchanges = rabbit.exchanges || { topic: 'events_topic' };

        // ensure connected
        await rabbit.connect();

        await rabbit.subscribe({ queue: 'sales.debt.requests', exchange: exchanges.topic, pattern: 'sale.debt.request' }, async (content /* parsed message */, routingKey) => {
            try {
                // expected content: { hashedCustomerId, requestingCompanyId, correlationId? }
                const { hashedCustomerId, requestingCompanyId, correlationId } = content || {};

                const inMemoryStore = require('../utils/inMemoryStore');

                if (!hashedCustomerId || !isValidHashedCustomerId(hashedCustomerId)) {
                    const resp = { success: false, error: 'malformed_hashedCustomerId', correlationId: correlationId || null, ts: new Date() };
                    try { inMemoryStore.enqueueEvent({ eventType: 'SALE_DEBT_RESPONSE', payload: resp }); } catch (e) { }
                    try { if (global && typeof global.rabbitmqPublish === 'function') await global.rabbitmqPublish('sale.debt.response', resp); } catch (e) { }
                    return;
                }

                // Lookup cross-company summary (fast read)
                const crossRepo = require('../repositories/crossCompanyRepository');
                const summary = await crossRepo.findByHashedCustomerId(hashedCustomerId);

                const resp = summary ? {
                    success: true,
                    exists: true,
                    hashedCustomerId: summary.hashedCustomerId,
                    totalOutstanding: summary.totalOutstanding || 0,
                    numActiveDebts: summary.numActiveDebts || 0,
                    largestDebt: summary.largestDebt || 0,
                    worstShareLevel: summary.worstShareLevel || 'NONE',
                    riskScore: summary.riskScore || 0,
                    riskLabel: summary.riskLabel || 'GOOD',
                    numCompaniesWithDebt: summary.numCompaniesWithDebt || (Array.isArray(summary.companies) ? summary.companies.length : 0),
                    detailAllowed: summary.worstShareLevel && summary.worstShareLevel !== 'NONE',
                    lastUpdated: summary.lastUpdated || new Date(),
                    correlationId: correlationId || null
                } : { success: true, exists: false, hashedCustomerId, correlationId: correlationId || null };

                // Durable recording for audit/outbox
                try { inMemoryStore.enqueueEvent({ eventType: 'SALE_DEBT_RESPONSE', payload: resp }); } catch (e) { }

                // Best-effort immediate publish so sales-service gets fast reply
                try { if (global && typeof global.rabbitmqPublish === 'function') await global.rabbitmqPublish('sale.debt.response', resp); } catch (e) { }
            } catch (err) {
                console.error('sale.debt.request handler error', err && err.message ? err.message : err);
            }
        });
    } catch (err) {
        console.warn('subscriberService failed to start:', err && err.message ? err.message : err);
    }
}

module.exports = { start };
