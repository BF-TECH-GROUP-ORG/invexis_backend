const eventRepo = require('../repositories/eventRepository');
const debtEventHandler = require('../events/handlers/debtEvent.handler');

let running = false;

const perf = require('../utils/perf');

async function processBatch() {
    // pick small batch first; avoid measuring when there is no work to reduce noise
    const events = await eventRepo.getUnprocessedBatch(25);
    if (!events || events.length === 0) return;

    return perf.measureAsync('outbox.processBatch', async () => {
        console.log(`[OutboxWorker] 📨 Processing ${events.length} event(s)...`);

        for (const ev of events) {
            try {
                console.log(`[OutboxWorker] 📤 Processing event: ${ev.eventType} for debt ${ev.payload?.debtId}`);
                
                // Route events to appropriate handlers
                if (ev.eventType === 'DEBT_CREATED') {
                    await debtEventHandler.handleDebtCreated(ev.payload);
                } else if (ev.eventType === 'DEBT_REPAID') {
                    await debtEventHandler.handleDebtRepaid(ev.payload);
                } else if (ev.eventType === 'DEBT_FULLY_PAID') {
                    await debtEventHandler.handleDebtFullyPaid(ev.payload);
                } else {
                    // Generic RabbitMQ publish for other events
                    if (global && typeof global.rabbitmqPublish === 'function') {
                        const routingKey = ev.eventType.toLowerCase().replace(/_/g, '.');
                        await global.rabbitmqPublish('debt.events', routingKey, ev.payload);
                    }
                }
                
                await eventRepo.markProcessed(ev._id);
                console.log(`[OutboxWorker] ✅ Event processed: ${ev.eventType}`);
            } catch (err) {
                console.warn(`[OutboxWorker] ❌ Failed to process ${ev.eventType} event:`, err && err.message ? err.message : err);
            }
        }
    });
}

function start(intervalMs = 3000) {
    if (running) return;
    running = true;
    console.log('Outbox worker started');
    setInterval(async () => {
        try { await processBatch(); } catch (err) { console.error('Outbox worker error', err); }
    }, intervalMs);
}

module.exports = { start };
