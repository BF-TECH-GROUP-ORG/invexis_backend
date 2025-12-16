// websocket-service/src/publishers/publisher.js
// Simple publisher helper for RabbitMQ used by other services
// Relies on shared rabbitmq helper at /app/shared/rabbitmq.js which your repo already uses

const uuid = require('uuid').v4;
const logger = require('../utils/logger');

let rabbitmq;
try {
    rabbitmq = require('/app/shared/rabbitmq.js');
} catch (err) {
    // Fallback - helpful in local dev when shared isn't mounted
    logger.warn('Shared rabbitmq module not available at /app/shared/rabbitmq.js. Publisher will fail until shared module is available.');
    rabbitmq = null;
}

const DEFAULT_OPTIONS = {
    persistent: true,
    contentType: 'application/json'
};

async function publish(exchange, routingKey, payload = {}, options = {}) {
    if (!rabbitmq || typeof rabbitmq.publish !== 'function') {
        throw new Error('RabbitMQ publisher not available');
    }

    const correlationId = options.correlationId || uuid();
    const messageId = options.messageId || uuid();
    const timestamp = new Date().toISOString();

    const message = {
        event: payload.event || routingKey,
        data: payload.data || payload,
        service: process.env.SERVICE_NAME || 'websocket-service',
        timestamp
    };

    const publishOptions = Object.assign({}, DEFAULT_OPTIONS, options, {
        correlationId,
        messageId
    });

    // Convert message to string - consistent with other services
    const payloadString = JSON.stringify(message);

    // Implement a small retry with exponential backoff
    const maxAttempts = options.attempts || 3;
    let attempt = 0;
    let lastErr;

    while (attempt < maxAttempts) {
        attempt++;
        try {
            await rabbitmq.publish(exchange, routingKey, payloadString, publishOptions);
            logger.info(`Published message to ${exchange}/${routingKey}`, { messageId, correlationId, attempt });
            return { messageId, correlationId };
        } catch (err) {
            lastErr = err;
            logger.warn(`Publish attempt ${attempt} to ${exchange}/${routingKey} failed`, { err: err.message });
            // simple backoff
            await new Promise(res => setTimeout(res, 100 * Math.pow(2, attempt)));
        }
    }

    logger.error(`Failed to publish message to ${exchange}/${routingKey} after ${maxAttempts} attempts`, { err: lastErr && lastErr.message });
    throw lastErr;
}

// Convenience helpers for common patterns
async function publishToUser(exchange, userId, payload = {}, options = {}) {
    // Use routing key that follows auth.user.<event> when appropriate
    // For realtime events we can use realtime.user.<action> or a generic realtime.user
    const routingKey = options.routingKey || `realtime.user.${payload.event || 'notification'}`;
    // Include a targetUserIds array in payload so consumers that use targetUserIds path will pick it
    const message = Object.assign({}, payload, { data: Object.assign({}, payload.data || {}, { userId }), targetUserIds: [userId] });
    return publish(exchange, routingKey, message, options);
}

async function publishToRoom(exchange, room, payload = {}, options = {}) {
    const routingKey = options.routingKey || `realtime.room.${room}`;
    const message = Object.assign({}, payload, { data: payload.data || {}, rooms: [room] });
    return publish(exchange, routingKey, message, options);
}

async function publishBroadcast(exchange, payload = {}, options = {}) {
    const routingKey = options.routingKey || 'realtime.broadcast';
    const message = Object.assign({}, payload, { data: payload.data || {} });
    return publish(exchange, routingKey, message, options);
}

module.exports = {
    publish,
    publishToUser,
    publishToRoom,
    publishBroadcast
};
