const mongoose = require('mongoose');
const debtRepo = require('../repositories/debtRepository');
const repaymentRepo = require('../repositories/repaymentRepository');
const eventRepo = require('../repositories/eventRepository');
const summaryRepo = require('../repositories/summaryRepository');
const Repayment = require('../models/repayment.model');
const Debt = require('../models/debt.model');
const { hashIdentifier } = require('../utils/hash');

// Helper to get redis client (check global first, then require fallbacks)
function getRedis() {
    if (global && global.redisClient) return global.redisClient;
    try { return require('/app/shared/redis.js'); } catch (e) { try { return require('../shared/redis'); } catch (e2) { return null; } }
}

async function computeStatus(totalAmount, amountPaidNow) {
    if (amountPaidNow <= 0) return 'UNPAID';
    if (amountPaidNow >= totalAmount) return 'PAID';
    return 'PARTIALLY_PAID';
}

// summaryRepo handles summary upserts

async function createDebt(payload) {
    const perf = require('../utils/perf');
    return perf.measureAsync('createDebt', async () => {
        const {
            companyId,
            shopId,
            customerId,
            salesId,
            salesStaffId,
            items = [],
            totalAmount,
            amountPaidNow = 0,
            dueDate
        } = payload;

        const balance = Number(totalAmount) - Number(amountPaidNow);
        const status = await computeStatus(totalAmount, amountPaidNow);

        // Ensure we never persist raw identifiers: compute hashedCustomerId if a raw identifier is provided
        const hashedCustomerId = payload.hashedCustomerId || (payload.rawCustomerIdentifier ? hashIdentifier(payload.rawCustomerIdentifier) : undefined);

        const debtDoc = {
            companyId,
            shopId,
            customerId,
            hashedCustomerId,
            salesId,
            salesStaffId,
            items,
            totalAmount,
            amountPaidNow,
            balance,
            status,
            dueDate,
            balanceHistory: [{ date: new Date(), balance }]
        };

        // Fast path: write to in-memory store + Redis-backed queue and return immediately
        const inMemoryStore = require('../utils/inMemoryStore');
        const saved = inMemoryStore.createDebt(debtDoc);

        // Fire-and-forget: enqueue summaries, events, publish immediate (best-effort), invalidate cache
        Promise.all([
            // Enqueue summary updates into the same durable pipeline
            inMemoryStore.enqueueSummary({ type: 'customer', op: 'onCreate', data: { companyId, customerId, totalAmount, amountPaidNow } }),
            inMemoryStore.enqueueSummary({ type: 'shop', op: 'onCreate', data: { companyId, shopId, totalAmount, amountPaidNow } }),
            inMemoryStore.enqueueSummary({ type: 'company', op: 'onCreate', data: { companyId, totalAmount, amountPaidNow } }),
            // enqueue outbox event (persisted by persister)
            (async () => {
                try { inMemoryStore.enqueueEvent({ eventType: 'DEBT_CREATED', payload: { debtId: saved._id, companyId, shopId, customerId } }); } catch (e) { /* swallow */ }
            })(),
            (async () => {
                try {
                    if (global && typeof global.rabbitmqPublish === 'function') {
                        await global.rabbitmqPublish('debt.created', { debtId: saved._id, companyId, shopId, customerId });
                    }
                } catch (e) { /* swallow */ }
            })(),
            (async () => {
                try { const redis = getRedis(); if (redis && redis.del) await redis.del(`company:${companyId}:debts`); } catch (e) { }
            })()
        ]).catch(err => console.warn('Background tasks failed:', err && err.message ? err.message : err));

        return saved;
    });
}

async function recordRepayment(payload) {
    const perf = require('../utils/perf');
    return perf.measureAsync('recordRepayment', async () => {
        const { debtId, companyId, shopId, customerId, amountPaid, paymentMethod = 'CASH', paymentReference, paymentId } = payload;

        // Idempotency check: prevent duplicate repayments via Redis deduplication key
        if (paymentId) {
            const redis = getRedis();
            if (redis && redis.get) {
                const dedupeKey = `repayment:${paymentId}`;
                try {
                    const existing = await redis.get(dedupeKey);
                    if (existing) {
                        return JSON.parse(existing); // Return cached response
                    }
                } catch (e) { /* swallow */ }
            }
        }

    const debt = await debtRepo.findById(debtId, companyId);
        if (!debt) throw new Error('Debt not found');

        // Fast path: create repayment in-memory + enqueue for persistence
        const inMemoryStore = require('../utils/inMemoryStore');
        const repayment = inMemoryStore.createRepayment({
            companyId,
            shopId,
            customerId,
            debtId,
            paymentId: paymentId || new mongoose.Types.ObjectId(),
            amountPaid,
            paymentMethod,
            paymentReference
        });

        // Update debt in-memory for immediate read availability
        debt.amountPaidNow = (Number(debt.amountPaidNow) + Number(amountPaid));
        debt.balance = Number(debt.totalAmount) - Number(debt.amountPaidNow);
        debt.status = await computeStatus(debt.totalAmount, debt.amountPaidNow);
        debt.repayments = debt.repayments || [];
        debt.repayments.push(repayment._id);
        debt.balanceHistory = debt.balanceHistory || [];
        debt.balanceHistory.push({ date: new Date(), balance: debt.balance });
        debt.updatedAt = new Date();
        // enqueue updated debt for persistence
        inMemoryStore.createDebt(debt);

        // Fire-and-forget: enqueue summaries, events, publish immediate, invalidate cache, cache response for deduplication
        const result = { debt, repayment };
        Promise.all([
            // Enqueue summary updates into the same durable pipeline
            inMemoryStore.enqueueSummary({ type: 'customer', op: 'onRepayment', data: { companyId, customerId, amountPaid } }),
            inMemoryStore.enqueueSummary({ type: 'shop', op: 'onRepayment', data: { companyId, shopId, amountPaid } }),
            inMemoryStore.enqueueSummary({ type: 'company', op: 'onRepayment', data: { companyId, amountPaid } }),
            (async () => { try { inMemoryStore.enqueueEvent({ eventType: 'DEBT_REPAID', payload: { debtId: debt._id, repaymentId: repayment._id, companyId, shopId, customerId } }); } catch (e) { } })(),
            (async () => {
                try {
                    if (global && typeof global.rabbitmqPublish === 'function') {
                        await global.rabbitmqPublish('debt.repayment.created', { debtId: debt._id, repaymentId: repayment._id, companyId });
                        // If debt moved to PAID, emit fully paid/status updated events too
                        if (debt.status === 'PAID') {
                            try { await global.rabbitmqPublish('debt.fully_paid', { debtId: debt._id, companyId }); } catch (e) { }
                            try { await global.rabbitmqPublish('debt.status.updated', { debtId: debt._id, status: 'PAID', companyId }); } catch (e) { }
                        } else {
                            try { await global.rabbitmqPublish('debt.status.updated', { debtId: debt._id, status: debt.status, companyId }); } catch (e) { }
                        }
                    }
                } catch (e) { }
            })(),
            (async () => {
                try { const redis = getRedis(); if (redis && redis.del) await redis.del(`company:${companyId}:debts`); } catch (e) { }
            })(),
            // Cache repayment response for 24h idempotency (if paymentId exists)
            (async () => {
                if (paymentId) {
                    const redis = getRedis();
                    if (redis && redis.set) {
                        try { await redis.set(`repayment:${paymentId}`, JSON.stringify(result), 'EX', 86400); } catch (e) { }
                    }
                }
            })()
        ]).catch(err => console.warn('Background tasks failed:', err && err.message ? err.message : err));

        return result;
    });
}

// Cross-company lookup by hashed customer id. Respects shareLevel and consentRef when returning results.
async function crossCompanyCustomerDebts({ hashedCustomerId, requestingCompanyId, limit = 100 }) {
    if (!hashedCustomerId) throw new Error('hashedCustomerId required');
    // Find candidate debts
    const candidates = await debtRepo.findByHashedCustomerId(hashedCustomerId, { limit, lean: true });
    // Map to safe view: only return limited fields and respect shareLevel
    const results = candidates.map(d => {
        // If the debt belongs to the requesting company, reveal full details
        if (String(d.companyId) === String(requestingCompanyId)) return d;
        // For others, respect shareLevel/consent: NONE -> hide, PARTIAL -> limited, FULL -> full
        const share = d.shareLevel || 'NONE';
        if (share === 'NONE') return null;
        if (share === 'PARTIAL') {
            return {
                debtId: d._id,
                companyId: d.companyId,
                shopId: d.shopId,
                status: d.status,
                balance: d.balance,
                totalAmount: d.totalAmount,
                consentRef: !!d.consentRef
            };
        }
        // FULL
        return {
            debtId: d._id,
            companyId: d.companyId,
            shopId: d.shopId,
            status: d.status,
            balance: d.balance,
            totalAmount: d.totalAmount,
            createdAt: d.createdAt
        };
    }).filter(Boolean);
    return results;
}

async function getDebtWithRepayments({ companyId, debtId }) {
    const debt = await debtRepo.findById(debtId, companyId);
    if (!debt) throw new Error('Debt not found');
    // load repayments
    const repayments = await Repayment.find({ debtId: debt._id }).sort({ paidAt: -1 }).lean();
    const plain = debt.toObject ? debt.toObject() : debt;
    plain.repayments = repayments;
    return plain;
}

async function listDebts({ companyId, shopId, customerId, status, page = 1, limit = 50 }) {
    const filter = { companyId, isDeleted: false };
    if (shopId) filter.shopId = shopId;
    if (customerId) filter.customerId = customerId;
    if (status) filter.status = status;

    // Try cache first (list queries benefit from short-term caching)
    const redis = getRedis();
    const cacheKey = `debts:list:${JSON.stringify({ companyId, shopId, customerId, status, page, limit })}`;
    try {
        if (redis && redis.get) {
            const cached = await redis.get(cacheKey);
            if (cached) return JSON.parse(cached);
        }
    } catch (e) { }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
        debtRepo.listDebts(filter, { skip, limit, lean: true }),
        debtRepo.countDebts(filter)
    ]);
    const result = { items, total, page, limit };
    // Cache for 30s
    try { if (redis && redis.set) await redis.set(cacheKey, JSON.stringify(result), 'EX', 30); } catch (e) { }
    return result;
}

// Simple analytics (examples)
async function companyAnalytics({ companyId }) {
    // Try cache
    const redis = getRedis();
    const cacheKey = `analytics:company:${companyId}`;
    try {
        if (redis && redis.get) {
            const cached = await redis.get(cacheKey);
            if (cached) return JSON.parse(cached);
        }
    } catch (e) { }

    const [totals] = await Debt.aggregate([
        { $match: { companyId: mongoose.Types.ObjectId(companyId), isDeleted: false } },
        { $group: { _id: null, totalOutstanding: { $sum: '$balance' }, totalCreditSales: { $sum: '$totalAmount' }, totalDebts: { $sum: 1 } } }
    ]);

    const [repaid] = await Repayment.aggregate([
        { $match: { companyId: mongoose.Types.ObjectId(companyId) } },
        { $group: { _id: null, totalRepaid: { $sum: '$amountPaid' } } }
    ]);

    const result = {
        totalOutstanding: totals ? totals.totalOutstanding : 0,
        totalCreditSales: totals ? totals.totalCreditSales : 0,
        totalDebts: totals ? totals.totalDebts : 0,
        totalRepaid: repaid ? repaid.totalRepaid : 0
    };

    try { if (redis && redis.set) await redis.set(cacheKey, JSON.stringify(result), 'EX', 30); } catch (e) { }
    return result;
}

async function shopAnalytics({ shopId }) {
    const redis = getRedis();
    const cacheKey = `analytics:shop:${shopId}`;
    try {
        if (redis && redis.get) {
            const cached = await redis.get(cacheKey);
            if (cached) return JSON.parse(cached);
        }
    } catch (e) { }

    const [totals] = await Debt.aggregate([
        { $match: { shopId: mongoose.Types.ObjectId(shopId), isDeleted: false } },
        { $group: { _id: null, totalOutstanding: { $sum: '$balance' }, totalDebts: { $sum: 1 } } }
    ]);

    const result = {
        totalOutstanding: totals ? totals.totalOutstanding : 0,
        totalDebts: totals ? totals.totalDebts : 0
    };

    try { if (redis && redis.set) await redis.set(cacheKey, JSON.stringify(result), 'EX', 30); } catch (e) { }
    return result;
}

async function customerAnalytics({ companyId, customerId }) {
    const redis = getRedis();
    const cacheKey = `analytics:customer:${companyId}:${customerId}`;
    try {
        if (redis && redis.get) {
            const cached = await redis.get(cacheKey);
            if (cached) return JSON.parse(cached);
        }
    } catch (e) { }

    const debts = await Debt.find({ companyId, customerId, isDeleted: false }).sort({ createdAt: 1 }).lean();
    const totalOwed = debts.reduce((s, d) => s + (d.totalAmount || 0), 0);
    const totalOutstanding = debts.reduce((s, d) => s + (d.balance || 0), 0);
    const highestDebt = debts.reduce((m, d) => Math.max(m, d.totalAmount || 0), 0);
    const oldestUnpaid = debts.filter(d => d.balance > 0).sort((a, b) => a.createdAt - b.createdAt)[0];

    const result = {
        totalOwed,
        totalOutstanding,
        highestDebt,
        oldestUnpaid: oldestUnpaid ? { debtId: oldestUnpaid._id, createdAt: oldestUnpaid.createdAt } : null
    };

    try { if (redis && redis.set) await redis.set(cacheKey, JSON.stringify(result), 'EX', 30); } catch (e) { }
    return result;
}

module.exports = {
    createDebt,
    recordRepayment,
    getDebtWithRepayments,
    listDebts,
    companyAnalytics,
    shopAnalytics,
    customerAnalytics,
    crossCompanyCustomerDebts
};
