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
            // We no longer accept a raw customerId here; all customer linkage is via hashedCustomerId
            customer, // optional object: { name, phone }
            salesId,
            createdBy, // optional actor: { id, name }
            items = [], // each item must include itemName
            totalAmount,
            amountPaidNow = 0,
            dueDate,
            hashedCustomerId: providedHashed,
            rawCustomerIdentifier // optional: phone/NID to be hashed if provided
        } = payload;

        const balance = Number(totalAmount || 0) - Number(amountPaidNow || 0);
        const status = await computeStatus(totalAmount, amountPaidNow);

        // Ensure we never persist raw identifiers: compute hashedCustomerId if a raw identifier is provided
        const hashedCustomerId = providedHashed || (rawCustomerIdentifier ? hashIdentifier(rawCustomerIdentifier) : undefined);

        // if (!hashedCustomerId) {
        //     throw new Error('hashedCustomerId (or rawCustomerIdentifier) is required to create a debt');
        // }

        // Normalize customer object: only keep display data (name, phone)
        const customerObj = customer
            ? {
                name: customer.name || null,
                phone: customer.phone || null
            }
            : undefined;

        // Validate items: each item must have itemName
        if (!Array.isArray(items) || items.some(i => !i.itemName)) {
            throw new Error('Each item must include itemName');
        }

        const debtDoc = {
            companyId,
            shopId,
            customer: customerObj,
            hashedCustomerId,
            salesId,
            items,
            totalAmount,
            amountPaidNow,
            balance,
            createdBy: createdBy || undefined,
            updatedBy: createdBy || undefined,
            status,
            dueDate,
            balanceHistory: [{ date: new Date(), balance }],
            isDeleted: false
        };

        // Direct write to DB first (ensures data is persisted before returning)
        const Debt = require('../models/debt.model');
        const savedDebt = await Debt.create(debtDoc);
        const saved = savedDebt.toObject ? savedDebt.toObject() : savedDebt;

        // Also write to in-memory store for fast reads
        const inMemoryStore = require('../utils/inMemoryStore');
        inMemoryStore.createDebt(saved);

        // NOTE: KnownCustomer upsert removed (handled in sales service).

        // Publish DEBT_CREATED event immediately to RabbitMQ (not just store in queue)
        const debtEventHandler = require('../events/handlers/debtEvent.handler');
        const eventPayload = {
            debtId: saved._id,
            companyId,
            shopId,
            hashedCustomerId,
            customer: customerObj || null,
            items,
            totalAmount,
            balance,
            amountPaidNow,
            status,
            dueDate,
            createdAt: saved.createdAt || new Date(),
            createdBy: createdBy || undefined
        };

        // Fire-and-forget: publish event to RabbitMQ + enqueue summaries, invalidate cache
        Promise.all([
            // Publish DEBT_CREATED event to RabbitMQ immediately
            (async () => {
                try {
                    // Log the payload we're about to emit (for observability)
                    try { console.log('[DebtService] ▶️ Emitting DEBT_CREATED payload:', JSON.stringify(eventPayload)); } catch (e) { }
                    await debtEventHandler.handleDebtCreated(eventPayload);
                    console.log(`[DebtService] 🚀 DEBT_CREATED event published to RabbitMQ for debt ${saved._id}`);
                } catch (e) { console.error('[DebtService] Failed to publish DEBT_CREATED event:', e && e.message ? e.message : e); }
            })(),
            // Also persist event to database as backup (for audit trail)
            (async () => {
                try {
                    inMemoryStore.enqueueEvent({
                        eventType: 'DEBT_CREATED',
                        payload: eventPayload
                    });
                    console.log(`[DebtService] 💾 DEBT_CREATED event also enqueued to database`);
                } catch (e) { console.error('[DebtService] Failed to enqueue DEBT_CREATED event:', e && e.message ? e.message : e); }
            })(),
            // Enqueue summary updates into the same durable pipeline
            inMemoryStore.enqueueSummary({
                type: 'customer',
                op: 'onCreate',
                data: { companyId, hashedCustomerId, totalAmount, amountPaidNow }
            }),
            inMemoryStore.enqueueSummary({ type: 'shop', op: 'onCreate', data: { companyId, shopId, totalAmount, amountPaidNow } }),
            inMemoryStore.enqueueSummary({ type: 'company', op: 'onCreate', data: { companyId, totalAmount, amountPaidNow } }),
            // cross-company summary upsert (persisted by persister)
            (async () => {
                try {
                    inMemoryStore.enqueueSummary({
                        type: 'cross_company',
                        op: 'onCreate',
                        data: {
                            hashedCustomerId,
                            amount: balance,
                            companyId,
                            createdAt: saved.createdAt || new Date()
                        }
                    });
                } catch (e) { }
            })(),
            (async () => {
                try {
                    if (global && typeof global.rabbitmqPublish === 'function') {
                        await global.rabbitmqPublish('debt.created', {
                            debtId: saved._id,
                            companyId,
                            shopId,
                            hashedCustomerId
                        });
                    }
                } catch (e) { /* swallow */ }
            })(),
            (async () => {
                try { const redis = getRedis(); if (redis && redis.del) await redis.del(`company:${companyId}:debts`); } catch (e) { }
            })()
        ]).catch(err => console.warn('Background tasks failed:', err && err.message ? err.message : err));

        // Invalidate cross-company lookup cache for this hashedCustomerId (if present)
        try {
            if (hashedCustomerId) {
                const redis = getRedis();
                if (redis && redis.del) await redis.del(`debt:lookup:${hashedCustomerId}`);
            }
        } catch (e) { }

        return saved;
    });
}

async function recordRepayment(payload) {
    const perf = require('../utils/perf');
    return perf.measureAsync('recordRepayment', async () => {
        const { debtId, companyId, shopId, amountPaid, paymentMethod = 'CASH', paymentReference, paymentId, createdBy } = payload;

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
        const repaymentId = paymentId || new mongoose.Types.ObjectId();
        const repayment = inMemoryStore.createRepayment({
            companyId,
            shopId,
            hashedCustomerId: debt.hashedCustomerId,
            debtId,
            paymentId: repaymentId,
            amountPaid,
            paymentMethod,
            paymentReference,
            createdBy: createdBy || undefined

        });

        // Trigger Payment Event if applicable (MTN/Airtel/Card)
        const normalizedPaymentMethod = String(paymentMethod).toLowerCase();

        // Logic Branch: CASH vs ASYNC (Mobile/Card/Bank Transfer)
        const isAsyncPayment = ['mobile', 'card', 'mtn_momo', 'airtel_money', 'mtn', 'airtel', 'bank_transfer'].includes(normalizedPaymentMethod);
        const isCash = normalizedPaymentMethod === 'cash';

        // 1. Prepare Repayment Record (Pending or Succeeded)
        const initialStatus = isCash ? 'succeeded' : 'pending';

        // Write repayment directly to DB first
        const savedRepayment = await Repayment.create({
            _id: repaymentId,
            companyId,
            shopId,
            hashedCustomerId: debt.hashedCustomerId,
            debtId: debt._id,
            paymentId: repaymentId,
            amountPaid,
            paymentMethod,
            paymentReference,
            createdBy: createdBy || undefined,
            status: initialStatus,
            paidAt: new Date(),
            createdAt: new Date()
        });

        // 2. If CASH, update Debt immediately
        let savedDebt = null;
        let wasAutoPaid = false;

        if (isCash) {
            // Update debt in-memory
            debt.amountPaidNow = Number(debt.amountPaidNow) + Number(amountPaid);
            debt.balance = Number(debt.totalAmount) - Number(debt.amountPaidNow);
            debt.status = await computeStatus(debt.totalAmount, debt.amountPaidNow);
            debt.repayments = debt.repayments || [];
            debt.repayments.push(repayment._id);
            debt.balanceHistory = debt.balanceHistory || [];
            debt.balanceHistory.push({ date: new Date(), balance: debt.balance });
            debt.updatedAt = new Date(); // Update timestamp

            const finalStatus = debt.balance <= 0 ? 'PAID' : debt.status;
            wasAutoPaid = finalStatus === 'PAID'; // && debt.status !== 'PAID'; (logic check simplified)

            // Persist Debt update
            savedDebt = await Debt.findOneAndUpdate(
                { _id: debtId, companyId, isDeleted: false },
                {
                    amountPaidNow: debt.amountPaidNow,
                    balance: Math.max(0, debt.balance),
                    status: finalStatus,
                    repayments: debt.repayments,
                    balanceHistory: debt.balanceHistory,
                    updatedAt: new Date()
                },
                { new: true, lean: true }
            );
        }

        // 3. If ASYNC, emit event and return (Debt not updated yet)
        if (isAsyncPayment) {
            const payerPhone = payload.phoneNumber || debt.customer?.phone;
            if (payerPhone) {
                // Determine Gateway and Method based on Repayment model enums
                let gateway = 'mtn_momo'; // Default
                let schemaPaymentMethod = 'mobile_money'; // Default

                if (normalizedPaymentMethod === 'bank_transfer' || normalizedPaymentMethod === 'card') {
                    gateway = 'manual';
                    schemaPaymentMethod = normalizedPaymentMethod;
                } else if (normalizedPaymentMethod === 'mtn' || normalizedPaymentMethod.includes('mtn')) {
                    gateway = 'mtn_momo';
                    schemaPaymentMethod = 'mobile_money';
                } else if (normalizedPaymentMethod.includes('airtel')) {
                    gateway = 'airtel_money';
                    schemaPaymentMethod = 'mobile_money';
                } else {
                    gateway = 'manual';
                    schemaPaymentMethod = 'manual';
                }

                const exchange = 'events_topic';
                const routingKey = 'debts.payment.requested';

                const eventPayload = {
                    event: 'PAYMENT_REQUESTED',
                    source: 'debt-service',
                    paymentType: 'DEBT',
                    referenceId: `DEBT-${repaymentId}`,
                    orderId: String(debt._id),
                    companyId: companyId,
                    shopId: shopId,
                    sellerId: createdBy && createdBy.id ? createdBy.id : (typeof createdBy === 'string' ? createdBy : 'unknown'),
                    amount: amountPaid,
                    currency: 'RWF',
                    description: `Debt Repayment for ${debt.customer?.name || 'Customer'}`,
                    paymentMethod: schemaPaymentMethod,
                    gateway: gateway,
                    phoneNumber: payerPhone,
                    customer: {
                        name: debt.customer?.name || 'Unknown Customer',
                        email: debt.customer?.email || 'no-email@provided.com',
                        phone: payerPhone
                    },
                    lineItems: [{
                        id: String(repaymentId),
                        name: 'Debt Repayment',
                        qty: 1,
                        price: amountPaid
                    }],
                    idempotencyKey: `pay_debt_${repaymentId}`,
                    metadata: {
                        repaymentId: String(repaymentId),
                        debtId: String(debtId),
                        shopId: String(shopId),
                        initiatedBy: createdBy
                    }
                };

                if (global && typeof global.rabbitmqPublish === 'function') {
                    await global.rabbitmqPublish(exchange, routingKey, eventPayload)
                        .then(() => console.log(`[DebtService] 📤 Emitted ${routingKey} to ${exchange}`))
                        .catch(err => console.error('Failed to emit DEBT payment request:', err));
                }
            }
        }

        // Fire-and-forget: enqueue summaries, events, publish immediate, invalidate cache, cache response for deduplication
        const result = { debt, repayment };
        const debtEventHandler = require('../events/handlers/debtEvent.handler');

        Promise.all([
            // Enqueue summary updates into the same durable pipeline
            inMemoryStore.enqueueSummary({
                type: 'customer',
                op: 'onRepayment',
                data: { companyId, hashedCustomerId: debt.hashedCustomerId, amountPaid }
            }),
            inMemoryStore.enqueueSummary({ type: 'shop', op: 'onRepayment', data: { companyId, shopId, amountPaid } }),
            inMemoryStore.enqueueSummary({ type: 'company', op: 'onRepayment', data: { companyId, amountPaid } }),
            // Publish DEBT_REPAID event to RabbitMQ immediately
            (async () => {
                try {
                    await debtEventHandler.handleDebtRepaid({
                        debtId: debt._id,
                        repaymentId: repayment._id,
                        companyId,
                        shopId,
                        amountPaid,
                        paymentMethod,
                        paymentReference,
                        newBalance: debt.balance,
                        newStatus: debt.status,
                        hashedCustomerId: debt.hashedCustomerId,
                        customer: debt.customer || null,
                        totalAmount: debt.totalAmount,
                        createdAt: new Date()
                    });
                    console.log(`[DebtService] 🚀 DEBT_REPAID event published to RabbitMQ for repayment ${repayment._id}`);
                } catch (e) { console.error('[DebtService] Failed to publish DEBT_REPAID event:', e && e.message ? e.message : e); }
            })(),
            // Also store for audit trail
            (async () => {
                try {
                    inMemoryStore.enqueueEvent({
                        eventType: 'DEBT_REPAID',
                        payload: {
                            debtId: debt._id,
                            repaymentId: repayment._id,
                            companyId,
                            shopId,
                            amountPaid,
                            newStatus: debt.status,
                            newBalance: debt.balance
                        }
                    });
                } catch (e) { }
            })(),
            // Publish fully paid event if debt is now complete
            (async () => {
                try {
                    if (wasAutoPaid) {
                        await debtEventHandler.handleDebtFullyPaid({
                            debtId: debt._id,
                            companyId,
                            shopId,
                            totalAmount: debt.totalAmount,
                            hashedCustomerId: debt.hashedCustomerId,
                            customer: debt.customer || null,
                            fullyPaidAt: new Date()
                        });
                        console.log(`[DebtService] 🎉 DEBT_FULLY_PAID event published to RabbitMQ for debt ${debt._id}`);
                    }
                } catch (e) { console.error('[DebtService] Failed to publish DEBT_FULLY_PAID event:', e && e.message ? e.message : e); }
            })(),
            // Notify other companies if debt was fully paid or partially repaid
            (async () => {
                try {
                    if (wasAutoPaid && debt.hashedCustomerId) {
                        const notify = {
                            type: 'CUSTOMER_DEBT_CLEARED',
                            hashedCustomerId: debt.hashedCustomerId,
                            debtId: debt._id,
                            companyId,
                            shopId: debt.shopId,
                            paidAmount: amountPaid,
                            status: 'PAID',
                            timestamp: new Date()
                        };
                        await global.rabbitmqPublish('customer.debt.alert', notify);
                    } else {
                        await global.rabbitmqPublish('debt.status.updated', { debtId: debt._id, status: debt.status, companyId });
                        // Notify other companies about repayment/progress (partial payment)
                        if (debt.hashedCustomerId) {
                            const notify = {
                                type: 'CUSTOMER_DEBT_UPDATED',
                                hashedCustomerId: debt.hashedCustomerId,
                                debtId: debt._id,
                                companyId,
                                shopId: debt.shopId,
                                totalAmount: debt.totalAmount,
                                balance: debt.balance,
                                status: debt.status,
                                timestamp: new Date()
                            };
                            await global.rabbitmqPublish('customer.debt.alert', notify);
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

        // Invalidate cross-company lookup cache for this hashedCustomerId (if present)
        try {
            if (debt && debt.hashedCustomerId) {
                const redis = getRedis();
                if (redis && redis.del) await redis.del(`debt:lookup:${debt.hashedCustomerId}`);
                // also enqueue cross-company repayment summary update
                try { inMemoryStore.enqueueSummary({ type: 'cross_company', op: 'onRepayment', data: { hashedCustomerId: debt.hashedCustomerId, amountPaid, companyId, debtId: debt._id, createdAt: new Date() } }); } catch (e) { }
            }
        } catch (e) { }

        // Return fresh DB data (savedDebt) if persisted, otherwise in-memory debt
        return { debt: savedDebt || debt, repayment };
    });
}

// Cross-company lookup by hashed customer id. Respects shareLevel and consentRef when returning results.
async function crossCompanyCustomerDebts({ hashedCustomerId, requestingCompanyId, limit = 100 }) {
    if (!hashedCustomerId) throw new Error('hashedCustomerId required');
    // Find candidate debts
    const candidates = await debtRepo.findByHashedCustomerId(hashedCustomerId, { limit, lean: true });
    // Map to safe view: we now always share full details (no shareLevel/consentRef)
    const results = candidates.map(d => {
        // If the debt belongs to the requesting company, reveal full details
        if (String(d.companyId) === String(requestingCompanyId)) return d;
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

    // Load repayments with details, sorted by most recent first
    const repayments = await Repayment.find({ debtId: debt._id })
        .sort({ paidAt: -1 })
        .lean()
        .exec();

    // Convert debt to plain object
    const plain = debt.toObject ? debt.toObject() : debt;

    // Attach repayments with formatted details
    plain.repayments = repayments.map(r => ({
        _id: r._id,
        paymentId: r.paymentId,
        amountPaid: r.amountPaid,
        paymentMethod: r.paymentMethod,
        paymentReference: r.paymentReference,
        paidAt: r.paidAt,
        createdAt: r.createdAt,
        createdBy: r.createdBy,
        customer: r.customer
    }));

    // Add payment summary
    plain.paymentSummary = {
        totalRepayments: repayments.length,
        totalPaidAmount: repayments.reduce((sum, r) => sum + (r.amountPaid || 0), 0),
        remainingBalance: plain.balance,
        lastPaymentDate: repayments.length > 0 ? repayments[0].paidAt : null
    };

    return plain;
}

async function listDebts({ companyId, shopId, hashedCustomerId, status, page = 1, limit = 50 }) {
    const filter = { isDeleted: false };
    if (companyId) filter.companyId = companyId;
    if (shopId) filter.shopId = shopId;
    if (hashedCustomerId) filter.hashedCustomerId = hashedCustomerId;
    if (status) filter.status = status;

    // Build cache key from filters only (not page/limit)
    const cacheKey = `debts:list:${JSON.stringify({ companyId: !!companyId, shopId: !!shopId, hashedCustomerId: !!hashedCustomerId, status, page, limit })}`;
    const redis = getRedis();
    try {
        if (redis && redis.get) {
            const cached = await redis.get(cacheKey);
            if (cached) return cached;
        }
    } catch (e) { /* non-critical */ }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
        debtRepo.listDebts(filter, { skip, limit, lean: true, sort: { createdAt: -1 } }),
        debtRepo.countDebts(filter)
    ]);
    const result = { items, total, page, limit, pageCount: Math.ceil(total / limit) };
    // Cache for 30s
    try { if (redis && redis.set) await redis.set(cacheKey, result, 30); } catch (e) { /* non-critical */ }
    return result;
}

// List all debts across all companies (no company filter) - for admin/maintenance use
async function listAllDebts({ status, page = 1, limit = 50 } = {}) {
    const filter = { isDeleted: false };
    if (status) filter.status = status;

    const redis = getRedis();
    const cacheKey = `debts:list:all:${JSON.stringify({ status, page, limit })}`;
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

async function customerAnalytics({ companyId, hashedCustomerId }) {
    const redis = getRedis();
    const cacheKey = `analytics:customer:${companyId}:${hashedCustomerId}`;
    try {
        if (redis && redis.get) {
            const cached = await redis.get(cacheKey);
            if (cached) return JSON.parse(cached);
        }
    } catch (e) { }

    const debts = await Debt.find({ companyId, hashedCustomerId, isDeleted: false }).sort({ createdAt: 1 }).lean();
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

async function updateDebt({ companyId, debtId, updates }) {
    const perf = require('../utils/perf');
    return perf.measureAsync('updateDebt', async () => {
        // Find the existing debt
        const existingDebt = await debtRepo.findById(debtId, companyId);
        if (!existingDebt) throw new Error('Debt not found or access denied');
        if (existingDebt.isDeleted) throw new Error('Cannot update deleted debt');

        // Allow updates to: dueDate, items (with recalculation), amountPaidNow (with recalculation)
        const allowedFields = ['dueDate', 'items', 'amountPaidNow'];
        const updateDoc = {};

        for (const field of allowedFields) {
            if (field in updates) {
                updateDoc[field] = updates[field];
            }
        }

        // If items or amountPaidNow changed, recalculate balance and status
        if ('items' in updateDoc || 'amountPaidNow' in updateDoc) {
            const newItems = updateDoc.items || existingDebt.items;
            const newAmountPaidNow = 'amountPaidNow' in updateDoc ? updateDoc.amountPaidNow : existingDebt.amountPaidNow;
            const newTotalAmount = newItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);

            updateDoc.totalAmount = newTotalAmount;
            updateDoc.balance = newTotalAmount - newAmountPaidNow;
            updateDoc.status = await computeStatus(newTotalAmount, newAmountPaidNow);

            // Track balance change in history
            if (!updateDoc.balanceHistory) {
                updateDoc.balanceHistory = existingDebt.balanceHistory || [];
            }
            updateDoc.balanceHistory.push({ date: new Date(), balance: updateDoc.balance });
        }

        // Update in MongoDB
        const updated = await Debt.findOneAndUpdate(
            { _id: debtId, companyId, isDeleted: false },
            updateDoc,
            { new: true, lean: true }
        );

        if (!updated) throw new Error('Failed to update debt');

        // Fire-and-forget: invalidate cache and emit event
        Promise.all([
            (async () => {
                try {
                    const redis = getRedis();
                    if (redis && redis.del) {
                        await redis.del(`company:${companyId}:debts`);
                        await redis.del(`shop:${updated.shopId}:debts`);
                    }
                } catch (e) { }
            })(),
            (async () => {
                try {
                    if (global && typeof global.rabbitmqPublish === 'function') {
                        await global.rabbitmqPublish('debt.updated', { debtId: updated._id, companyId, changes: Object.keys(updateDoc) });
                    }
                } catch (e) { /* swallow */ }
            })()
        ]).catch(err => console.warn('Background tasks failed:', err && err.message ? err.message : err));

        return updated;
    });
}

async function softDeleteDebt({ companyId, debtId }) {
    const perf = require('../utils/perf');
    return perf.measureAsync('softDeleteDebt', async () => {
        // Find the debt
        const debt = await debtRepo.findById(debtId, companyId);
        if (!debt) throw new Error('Debt not found or access denied');
        if (debt.isDeleted) throw new Error('Debt already deleted');

        // Soft delete: set isDeleted flag
        const deleted = await Debt.findOneAndUpdate(
            { _id: debtId, companyId, isDeleted: false },
            { isDeleted: true, deletedAt: new Date() },
            { new: true, lean: true }
        );

        if (!deleted) throw new Error('Failed to delete debt');

        // Fire-and-forget: invalidate cache and emit event
        Promise.all([
            (async () => {
                try {
                    const redis = getRedis();
                    if (redis && redis.del) {
                        await redis.del(`company:${companyId}:debts`);
                        await redis.del(`shop:${deleted.shopId}:debts`);
                    }
                } catch (e) { }
            })(),
            (async () => {
                try {
                    if (global && typeof global.rabbitmqPublish === 'function') {
                        await global.rabbitmqPublish('debt.deleted', { debtId: deleted._id, companyId });
                    }
                } catch (e) { /* swallow */ }
            })()
        ]).catch(err => console.warn('Background tasks failed:', err && err.message ? err.message : err));

        return { message: 'Debt soft-deleted successfully', debtId: deleted._id };
    });
}

// Mark a debt as paid (creates a repayment for the remaining balance if needed)
async function markDebtPaid({ companyId, debtId, paymentMethod = 'MANUAL', paymentReference, paymentId, createdBy }) {
    const perf = require('../utils/perf');
    return perf.measureAsync('markDebtPaid', async () => {
        const debt = await debtRepo.findById(debtId, companyId);
        if (!debt) throw new Error('Debt not found');
        if (debt.status === 'PAID') return { message: 'Debt already paid', debt };

        const remaining = Number(debt.totalAmount) - Number(debt.amountPaidNow || 0);
        const inMemoryStore = require('../utils/inMemoryStore');
        let repayment = null;
        if (remaining > 0) {
            repayment = inMemoryStore.createRepayment({
                companyId,
                shopId: debt.shopId,
                hashedCustomerId: debt.hashedCustomerId,
                debtId: debt._id,
                paymentId: paymentId || new mongoose.Types.ObjectId(),
                amountPaid: remaining,
                paymentMethod,
                paymentReference,
                createdBy: createdBy || debt.updatedBy || debt.createdBy || undefined
            });

            // update debt in-memory
            debt.amountPaidNow = Number(debt.amountPaidNow || 0) + Number(remaining);
            debt.balance = Number(debt.totalAmount) - Number(debt.amountPaidNow);
            debt.status = await computeStatus(debt.totalAmount, debt.amountPaidNow);
            debt.repayments = debt.repayments || [];
            debt.repayments.push(repayment._id);
            debt.balanceHistory = debt.balanceHistory || [];
            debt.balanceHistory.push({ date: new Date(), balance: debt.balance });
            debt.updatedAt = new Date();
            inMemoryStore.createDebt(debt);
        } else {
            // nothing to pay but set status to PAID
            debt.status = 'PAID';
            debt.updatedAt = new Date();
            inMemoryStore.createDebt(debt);
        }

        // DIRECT DB WRITE: persist repayment (if any) and updated debt immediately so the DB reflects PAID status
        let savedDebt = null;
        try {
            if (repayment) {
                // persist repayment record
                await Repayment.create({
                    _id: repayment._id,
                    companyId,
                    shopId: debt.shopId,
                    hashedCustomerId: debt.hashedCustomerId,
                    debtId: debt._id,
                    paymentId: repayment.paymentId || repayment._id,
                    amountPaid: repayment.amountPaid,
                    paymentMethod: repayment.paymentMethod,
                    paymentReference: repayment.paymentReference,
                    createdBy: repayment.createdBy || undefined,
                    paidAt: new Date(),
                    createdAt: new Date()
                });
            }

            // Force final status to PAID when marking paid
            const finalStatus = 'PAID';

            // Convert companyId to ObjectId if needed (allow UUID/string passed from client)
            let companyIdQuery = companyId;
            try {
                if (typeof companyId === 'string' && companyId.length === 24) {
                    companyIdQuery = mongoose.Types.ObjectId(companyId);
                }
            } catch (e) {
                companyIdQuery = companyId;
            }

            savedDebt = await Debt.findOneAndUpdate(
                { _id: debtId, companyId: companyIdQuery, isDeleted: false },
                {
                    amountPaidNow: debt.amountPaidNow,
                    balance: Math.max(0, debt.balance),
                    status: finalStatus,
                    repayments: debt.repayments,
                    balanceHistory: debt.balanceHistory,
                    updatedAt: debt.updatedAt
                },
                { new: true, lean: true }
            );

            if (savedDebt) {
                // reflect DB-persisted object in the returned in-memory debt
                Object.assign(debt, savedDebt);
            }
        } catch (e) {
            console.error('Direct DB write failed (will retry via persister):', e.message);
        }

        // Fire-and-forget background tasks (enqueue events/summaries, invalidate cache, publish notifications)
        Promise.all([
            (async () => { try { inMemoryStore.enqueueEvent({ eventType: 'DEBT_MARKED_PAID', payload: { debtId: debt._id, companyId, repaymentId: repayment ? repayment._id : null } }); } catch (e) { } })(),
            (async () => { try { inMemoryStore.enqueueSummary({ type: 'company', op: 'onRepayment', data: { companyId, amountPaid: remaining } }); } catch (e) { } })(),
            (async () => { try { inMemoryStore.enqueueSummary({ type: 'cross_company', op: 'onRepayment', data: { hashedCustomerId: debt.hashedCustomerId, amountPaid: remaining, companyId, debtId: debt._id, createdAt: new Date() } }); } catch (e) { } })(),
            (async () => { try { const redis = getRedis(); if (redis && redis.del) await redis.del(`company:${companyId}:debts`); if (debt.hashedCustomerId) await redis.del(`debt:lookup:${debt.hashedCustomerId}`); } catch (e) { } })(),
            (async () => {
                try {
                    if (global && typeof global.rabbitmqPublish === 'function') {
                        await global.rabbitmqPublish('debt.fully_paid', { debtId: debt._id, companyId });
                        await global.rabbitmqPublish('debt.status.updated', { debtId: debt._id, status: 'PAID', companyId });
                    }
                } catch (e) { }
            })()
        ]).catch(err => console.warn('Background tasks failed:', err && err.message ? err.message : err));

        // Return the DB-persisted debt when available (ensures caller sees PAID status)
        return { debt: savedDebt || debt, repayment };
    });
}

// Cancel a debt: mark status CANCELLED and treat remaining balance as written-off (update summaries)
async function cancelDebt({ companyId, debtId, reason = null, performedBy }) {
    const perf = require('../utils/perf');
    return perf.measureAsync('cancelDebt', async () => {
        const debt = await debtRepo.findById(debtId, companyId);
        if (!debt) throw new Error('Debt not found');
        if (debt.status === 'CANCELLED') return { message: 'Debt already cancelled', debt };

        const writeOffAmount = Number(debt.balance || 0);
        debt.status = 'CANCELLED';
        debt.cancelledAt = new Date();
        debt.cancelReason = reason;
        debt.cancelledBy = performedBy || debt.updatedBy || debt.createdBy || undefined;
        debt.updatedBy = performedBy || debt.updatedBy || debt.createdBy || undefined;
        debt.updatedAt = new Date();
        const inMemoryStore = require('../utils/inMemoryStore');
        inMemoryStore.createDebt(debt);

        // DIRECT DB WRITE: persist cancelled debt immediately to DB (SYNC - must complete before returning)
        let savedDebt = null;
        try {
            // Convert companyId to ObjectId if needed (allow UUID/string passed from client)
            let companyIdQuery = companyId;
            try {
                if (typeof companyId === 'string' && companyId.length !== 24) {
                    companyIdQuery = companyId;
                } else if (typeof companyId === 'string') {
                    companyIdQuery = mongoose.Types.ObjectId(companyId);
                }
            } catch (e) {
                companyIdQuery = companyId;
            }

            savedDebt = await Debt.findOneAndUpdate(
                { _id: debtId, companyId: companyIdQuery, isDeleted: false },
                {
                    status: 'CANCELLED',
                    cancelledAt: debt.cancelledAt,
                    cancelReason: debt.cancelReason,
                    cancelledBy: debt.cancelledBy,
                    updatedBy: debt.updatedBy,
                    updatedAt: debt.updatedAt
                },
                { new: true, lean: true }
            );
        } catch (e) {
            console.error('Direct DB write failed for cancelDebt:', e.message);
            throw new Error(`Failed to cancel debt: ${e.message}`);
        }

        // Fire-and-forget: enqueue events and adjust summaries (treat as repayment for summary adjustment)
        Promise.all([
            (async () => { try { inMemoryStore.enqueueEvent({ eventType: 'DEBT_CANCELLED', payload: { debtId: savedDebt._id || debt._id, companyId, reason } }); } catch (e) { } })(),
            (async () => { try { if (writeOffAmount > 0) inMemoryStore.enqueueSummary({ type: 'cross_company', op: 'onRepayment', data: { hashedCustomerId: debt.hashedCustomerId, amountPaid: writeOffAmount, companyId, debtId: debt._id, createdAt: new Date() } }); } catch (e) { } })(),
            (async () => { try { const redis = getRedis(); if (redis && redis.del) await redis.del(`company:${companyId}:debts`); if (debt.hashedCustomerId) await redis.del(`debt:lookup:${debt.hashedCustomerId}`); } catch (e) { } })(),
            (async () => {
                try {
                    if (global && typeof global.rabbitmqPublish === 'function') {
                        await global.rabbitmqPublish('debt.cancelled', {
                            debtId: savedDebt._id || debt._id,
                            companyId,
                            reason,
                            hashedCustomerId: debt.hashedCustomerId,
                            customer: debt.customer || null,
                            totalAmount: debt.totalAmount,
                            balance: debt.balance
                        });
                    }
                } catch (e) { }
            })()
        ]).catch(err => console.warn('Background tasks failed:', err && err.message ? err.message : err));

        // Return DB-persisted debt with CANCELLED status
        return { debt: savedDebt || debt };
    });
}

module.exports = {
    createDebt,
    recordRepayment,
    getDebtWithRepayments,
    listDebts,
    companyAnalytics,
    shopAnalytics,
    customerAnalytics,
    crossCompanyCustomerDebts,
    updateDebt,
    softDeleteDebt
    ,
    markDebtPaid,
    cancelDebt,
    listAllDebts
};
