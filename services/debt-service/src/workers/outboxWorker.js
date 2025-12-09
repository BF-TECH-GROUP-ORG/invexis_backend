const eventRepo = require('../repositories/eventRepository');

let running = false;

const perf = require('../utils/perf');

async function processBatch() {
    return perf.measureAsync('outbox.processBatch', async () => {
        // pick small batch
        const events = await eventRepo.getUnprocessedBatch(25);
        if (!events || events.length === 0) return;

        for (const ev of events) {
            try {
                // publish to rabbitmq
                const { emit } = require('../events/producer');
                await emit(ev.eventType || ev.routingKey, ev.payload);
                await eventRepo.markProcessed(ev._id);
            } catch (err) {
                console.warn('Failed to publish event, will retry later', err && err.message ? err.message : err);
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
