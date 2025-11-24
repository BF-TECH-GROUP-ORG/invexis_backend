const eventRepo = require('../repositories/eventRepository');

async function createOutboxEvent(eventType, payload) {
    return eventRepo.createEvent({ eventType, payload });
}

const perf = require('../utils/perf');

async function publishImmediate(routingKey, payload) {
    return perf.measureAsync('publishImmediate', async () => {
        try {
            if (global && typeof global.rabbitmqPublish === 'function') {
                await global.rabbitmqPublish(routingKey, payload);
                return true;
            }
        } catch (e) {
            // swallow - worker will pick the event
        }
        return false;
    });
}

module.exports = { createOutboxEvent, publishImmediate };
