const eventService = require('../services/eventService');
const eventRepo = require('../repositories/eventRepository');

// Accepts a publish request and writes to outbox; attempts immediate publish
async function publishEvent(req, res) {
    try {
        const { eventType, payload } = req.body;
        if (!eventType || !payload) return res.status(400).json({ error: 'eventType and payload required' });

        // write outbox
        const ev = await eventRepo.createEvent({ eventType, payload });

        // try immediate publish
        try { await eventService.publishImmediate(eventType.toLowerCase().replace(/_/g, '.'), payload); } catch (e) { }

        res.status(201).json({ eventId: ev._id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

module.exports = { publishEvent };
