/**
 * Debt Service Event Producer
 * Publishes events to RabbitMQ
 */

const { publish, exchanges } = require('/app/shared/rabbitmq');

/**
 * Emit event to RabbitMQ
 * @param {string} routingKey - Event routing key
 * @param {object} payload - Event payload
 */
const emit = async (routingKey, payload) => {
    try {
        await publish(exchanges.topic, routingKey, payload);
        console.log(`✅ Published event: ${routingKey}`);
    } catch (error) {
        console.error(`❌ Failed to publish ${routingKey}:`, error.message);
        throw error;
    }
};

module.exports = { emit };
