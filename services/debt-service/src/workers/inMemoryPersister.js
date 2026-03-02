const inMemoryStore = require('../utils/inMemoryStore');
const debtRepo = require('../repositories/debtRepository');
const repaymentRepo = require('../repositories/repaymentRepository');
const eventRepo = require('../repositories/eventRepository');
const summaryRepo = require('../repositories/summaryRepository');
const perf = require('../utils/perf');
const metrics = require('../utils/metrics');

function getRedis() {
    if (global && global.redisClient) return global.redisClient;
    try { return require('/app/shared/redis.js'); } catch (e) { try { return require('/app/shared/redis'); } catch (e2) { return null; } }
}
// DO NOT cache redis at module load; call getRedis() at runtime to pick up global.redisClient
const WRITE_QUEUE_KEY = 'write_queue';
const BRPOP_TIMEOUT = 5; // seconds

let started = false;
let processing = false;

async function persistBatch(limit = 200) {
    if (processing) return;
    processing = true;
    try {
        let items = [];

        const redis = getRedis();
        if (redis && typeof redis.brpop === 'function') {
            // Prefer draining with LPOP to process batches quickly
            if (typeof redis.lpop === 'function') {
                try {
                    for (let i = 0; i < limit; i++) {
                        const raw = await redis.lpop(WRITE_QUEUE_KEY);
                        if (!raw) break;
                        try { items.push(JSON.parse(raw)); } catch (e) { console.warn('invalid queue item', e.message); }
                    }
                } catch (e) { console.warn('redis lpop batch error', e && e.message ? e.message : e); }
            }

            // If nothing found, block for a short period
            if (items.length === 0) {
                try {
                    const result = await redis.brpop(WRITE_QUEUE_KEY, BRPOP_TIMEOUT);
                    if (result && result[1]) {
                        try { items.push(JSON.parse(result[1])); } catch (e) { console.warn('invalid brpop item', e.message); }
                    }
                } catch (e) { console.warn('redis brpop error', e && e.message ? e.message : e); }
            }
        } else {
            // Fallback to the in-memory queue used in tests / standalone mode
            try { items = inMemoryStore.drainQueue(limit); } catch (e) { console.warn('inMemoryStore drain error', e && e.message ? e.message : e); }
        }

        if (!items || items.length === 0) return;

        console.log(`[InMemoryPersister] 💾 Persisting ${items.length} items (${items.map(i => i.type).filter(Boolean).join(', ')})...`);

        await perf.measureAsync('inMemoryPersister.batch', async () => {
            for (const it of items) {
                try {
                    if (!it || !it.type) continue;
                    if (it.type === 'debt') {
                        await debtRepo.createDebt(it.doc).catch(e => console.warn('persist debt failed', e && e.message ? e.message : e));
                        metrics.recordPersisted('debt');
                        console.log(`[InMemoryPersister] ✅ Persisted debt ${it.doc && it.doc._id}`);
                    } else if (it.type === 'repayment') {
                        await repaymentRepo.createRepayment(it.doc).catch(e => console.warn('persist repayment failed', e && e.message ? e.message : e));
                        metrics.recordPersisted('repayment');
                        console.log(`[InMemoryPersister] ✅ Persisted repayment ${it.doc && it.doc._id}`);
                    } else if (it.type === 'event') {
                        await eventRepo.createEvent(it.doc).catch(e => console.warn('persist event failed', e && e.message ? e.message : e));
                        metrics.recordPersisted('event');
                        console.log(`[InMemoryPersister] ✅ Persisted event ${it.doc && it.doc.eventType}`);
                    } else if (it.type === 'summary') {
                        const { type, op, data } = it.doc || {};
                        try {
                            if (type === 'customer') {
                                if (op === 'onCreate') await summaryRepo.upsertCustomerOnCreate(data);
                                else if (op === 'onRepayment') await summaryRepo.updateCustomerOnRepayment(data);
                            } else if (type === 'shop') {
                                if (op === 'onCreate') await summaryRepo.upsertShopOnCreate(data);
                                else if (op === 'onRepayment') await summaryRepo.updateShopOnRepayment(data);
                            } else if (type === 'company') {
                                if (op === 'onCreate') await summaryRepo.upsertCompanyOnCreate(data);
                                else if (op === 'onRepayment') await summaryRepo.updateCompanyOnRepayment(data);
                            } else if (type === 'cross_company') {
                                const crossRepo = require('../repositories/crossCompanyRepository');
                                if (op === 'onCreate') await crossRepo.upsertOnDebtCreate(data);
                                else if (op === 'onRepayment') await crossRepo.updateOnRepayment(data);
                            }
                            metrics.recordPersisted('summary');
                        } catch (e) {
                            console.warn('persist summary failed', e && e.message ? e.message : e);
                            metrics.recordPersistenceError();
                        }
                    } else {
                        console.warn('Unknown persist item type', it.type);
                    }
                } catch (e) {
                    console.warn('persist item error', e && e.message ? e.message : e);
                    metrics.recordPersistenceError();
                }
            }
        });
    } catch (e) {
        console.warn('persistBatch error', e && e.message ? e.message : e);
    } finally {
        processing = false;
    }
}

function start(intervalMs = 5000) {
    if (started) return;
    started = true;
    console.log('In-memory persister started');
    // Use setInterval to periodically try to persist; this keeps behavior consistent with other workers
    setInterval(async () => {
        try { await persistBatch(); } catch (e) { console.warn('inMemoryPersister loop error', e && e.message ? e.message : e); }
    }, intervalMs);
}

module.exports = { start, persistBatch };
