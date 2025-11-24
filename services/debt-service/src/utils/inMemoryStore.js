// Very small, fast in-process store used as the "RAM fast path".
// When a Redis client is available we push write-envelopes into a Redis list
// for durability; a background persister drains that list and writes to MongoDB.
// WARNING: this is per-process cache for reads and Redis is used as a write-ahead
// queue. If Redis is unavailable the store falls back to an in-memory queue.

const mongoose = require('mongoose');

function getRedis() {
    if (global && global.redisClient) return global.redisClient;
    try { return require('/app/shared/redis.js'); } catch (e) { try { return require('/app/shared/redis'); } catch (e2) { return null; } }
}

const WRITE_QUEUE_KEY = 'write_queue';

class InMemoryStore {
    constructor() {
        this.debts = new Map(); // debtId -> debt object
        this.repayments = new Map(); // repaymentId -> repayment object
        this.queue = []; // fallback write-through queue to persist to DB when Redis missing
    }

    // Create a debt in memory and enqueue for persistence (Redis if available)
    createDebt(debt) {
        // prefer Mongo ObjectId strings for compatibility with Mongoose schemas
        const id = debt._id || new mongoose.Types.ObjectId().toString();
        const now = new Date();
        const doc = Object.assign({ _id: id, createdAt: now, updatedAt: now }, debt);
        this.debts.set(id.toString(), doc);

        const envelope = { type: 'debt', doc };
        const redis = getRedis();
        if (redis && typeof redis.rpush === 'function') {
            // fire-and-forget; don't await to keep request path fast
            try { redis.rpush(WRITE_QUEUE_KEY, JSON.stringify(envelope)).catch(() => { }); } catch (e) { /* swallow */ }
        } else {
            this.queue.push(envelope);
        }

        return doc;
    }

    // Record repayment in memory and enqueue
    createRepayment(repayment) {
        // prefer Mongo ObjectId strings for compatibility with Mongoose schemas
        const id = repayment._id || new mongoose.Types.ObjectId().toString();
        const now = new Date();
        const doc = Object.assign({ _id: id, createdAt: now, paidAt: repayment.paidAt || now }, repayment);
        this.repayments.set(id.toString(), doc);

        const envelope = { type: 'repayment', doc };
        const redis = getRedis();
        if (redis && typeof redis.rpush === 'function') {
            try { redis.rpush(WRITE_QUEUE_KEY, JSON.stringify(envelope)).catch(() => { }); } catch (e) { /* swallow */ }
        } else {
            this.queue.push(envelope);
        }

        return doc;
    }

    getDebt(debtId) {
        return this.debts.get(debtId.toString()) || null;
    }

    listDebtsByCompany(companyId) {
        const out = [];
        for (const d of this.debts.values()) {
            if (d.companyId && d.companyId.toString() === companyId.toString()) out.push(d);
        }
        return out;
    }

    // Drain up to `limit` items from the local fallback queue (FIFO)
    drainQueue(limit = 100) {
        const items = this.queue.splice(0, limit);
        return items;
    }

    // For diagnostics
    queueLength() {
        const redis = getRedis();
        if (redis && typeof redis.llen === 'function') {
            try { return redis.llen(WRITE_QUEUE_KEY); } catch (e) { return this.queue.length; }
        }
        return this.queue.length;
    }

    // Enqueue a generic event envelope (type: 'event')
    enqueueEvent(eventDoc) {
        const envelope = { type: 'event', doc: eventDoc };
        const redis = getRedis();
        if (redis && typeof redis.rpush === 'function') {
            try { redis.rpush(WRITE_QUEUE_KEY, JSON.stringify(envelope)).catch(() => { }); } catch (e) { /* swallow */ }
        } else {
            this.queue.push(envelope);
        }
    }

    // Enqueue a summary update (type: 'summary')
    enqueueSummary(summaryOp) {
        const envelope = { type: 'summary', doc: summaryOp };
        const redis = getRedis();
        if (redis && typeof redis.rpush === 'function') {
            try { redis.rpush(WRITE_QUEUE_KEY, JSON.stringify(envelope)).catch(() => { }); } catch (e) { /* swallow */ }
        } else {
            this.queue.push(envelope);
        }
    }
}

module.exports = new InMemoryStore();
