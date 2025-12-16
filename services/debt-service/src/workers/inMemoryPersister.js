const inMemoryStore = require('../utils/inMemoryStore');
const debtRepo = require('../repositories/debtRepository');
const repaymentRepo = require('../repositories/repaymentRepository');
const eventRepo = require('../repositories/eventRepository');
const summaryRepo = require('../repositories/summaryRepository');
const perf = require('../utils/perf');
const metrics = require('../utils/metrics');

function getRedis() { if (global && global.redisClient) return global.redisClient; try { return require('/app/shared/redis.js'); } catch (e) { try { return require('/aapp/shared/redis'); } catch (e2) { return null; } } }
// DO NOT cache redis at module load; call getRedis() at runtime to pick up global.redisClient
const WRITE_QUEUE_KEY = 'write_queue';
const BRPOP_TIMEOUT = 5; // 5 second timeout for BRPOP blocking

let running = false;

async function persistBatch(limit = 200) {
    if (running) return;
    running = true;
    try {
        let items = [];

        const redis = getRedis();
        if (redis && typeof redis.brpop === 'function') {
            // First, try LPOP all pending items without blocking
            if (typeof redis.lpop === 'function') {
                try {
                    for (let i = 0; i < limit; i++) {
                        const raw = await redis.lpop(WRITE_QUEUE_KEY);
                        if (!raw) break;
                        const parsed = JSON.parse(raw);
                        items.push(parsed);
                    }
                } catch (e) {
                    console.warn('redis lpop batch error', e.message);
                }
            }
            // If queue is empty after LPOP, block and wait for next item (max BRPOP_TIMEOUT seconds)
            if (items.length === 0) {
                try {
                    const result = await redis.brpop(WRITE_QUEUE_KEY, BRPOP_TIMEOUT);
                    if (result && result[1]) {
                        const parsed = JSON.parse(result[1]);
                        items.push(parsed);
                    }
                } catch (e) {
                    console.warn('redis brpop error', e.message);
                }
            }
        } else {
            items = inMemoryStore.drainQueue(limit);
        }

        if (!items || items.length === 0) return;

        console.log(`[InMemoryPersister] 💾 Persisting ${items.length} items (${items.filter(i => i.type).map(i => i.type).join(', ')})...`);

        await perf.measureAsync('inMemoryPersister.batch', async () => {
            // persist sequentially to keep ordering per item
            for (const it of items) {
                try {
                    if (it.type === 'debt') {
                        await debtRepo.createDebt(it.doc).catch(e => console.warn('persist debt failed', e.message));
                        metrics.recordPersisted('debt');
                        console.log(`[InMemoryPersister] ✅ Persisted debt ${it.doc._id}`);
                    } else if (it.type === 'event') {
                        await eventRepo.createEvent(it.doc).catch(e => console.warn('persist event failed', e.message));
                        metrics.recordPersisted('event');
                        console.log(`[InMemoryPersister] ✅ Persisted event ${it.doc.eventType}`);
                    } else if (it.type === 'repayment') {
                        await repaymentRepo.createRepayment(it.doc).catch(e => console.warn('persist repayment failed', e.message));
                        metrics.recordPersisted('repayment');
                        console.log(`[InMemoryPersister] ✅ Persisted repayment ${it.doc._id}`);
                    }                        metrics.recordPersisted('debt');
                    } else if (it.type === 'repayment') {
                        await repaymentRepo.createRepayment(it.doc).catch(e => console.warn('persist repayment failed', e.message));
                        metrics.recordPersisted('repayment');
                    } else if (it.type === 'event') {
                        await eventRepo.createEvent(it.doc).catch(e => console.warn('persist event failed', e.message));
                        metrics.recordPersisted('event');
                    } else if (it.type === 'summary') {
                        // Apply summary updates based on the operation
                        const { type, op, data } = it.doc;
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
                                // cross-company summary updates
                                const crossRepo = require('../repositories/crossCompanyRepository');
                                if (op === 'onCreate') await crossRepo.upsertOnDebtCreate(data);
                                else if (op === 'onRepayment') await crossRepo.updateOnRepayment(data);
                            }
                            metrics.recordPersisted('summary');
                        } catch (e) {
                            console.warn('persist summary failed', e.message);
                            metrics.recordPersistenceError();
                        }
                    }
                } catch (e) {
                    console.warn('persist item error', e.message);
                    metrics.recordPersistenceError();
                }
            }
        });
    } finally {
        running = false;
    }
}

async function start() {
    // Loop indefinitely: use BRPOP for blocking waits, process batches when available
    console.log('In-memory persister started (BRPOP-based blocking)');
    while (true) {
        try {
            await persistBatch();
        } catch (e) {
            console.warn('inMemoryPersister error', e.message);
        }
    }
}

module.exports = { start, persistBatch };
