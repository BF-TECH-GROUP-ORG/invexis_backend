/**
 * @file RabbitMQ Client - Optimized for High-Scale Microservices
 * @description Standardized, resilient RabbitMQ client for millions of users.
 * Handles reconnections with exponential backoff, idempotent assertions,
 * metrics logging, and DLQ/retry queues. Uses durable exchanges/queues for reliability.
 * For production: Monitor with Prometheus, use clustering for HA.
 */

'use strict';

const amqp = require('amqplib');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://invexis:invexispass@rabbitmq:5672";
const RETRY_LIMIT = parseInt(process.env.RABBITMQ_RETRY_LIMIT) || 3;
const RETRY_DELAY = parseInt(process.env.RABBITMQ_RETRY_DELAY) || 5000;
const PREFETCH_COUNT = parseInt(process.env.RABBITMQ_PREFETCH_COUNT) || 10;
const RECONNECT_INTERVAL_BASE = parseInt(process.env.RABBITMQ_RECONNECT_BASE) || 1000;
const MAX_RECONNECT_ATTEMPTS = parseInt(process.env.MAX_RECONNECT_ATTEMPTS) || 10;

class RabbitMQ {
    constructor() {
        this.connection = null;
        this.channel = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.reconnectTimeout = null;
        this.subscriptions = new Map();  // Track subscribers for cleanup

        // Exchanges (durable for persistence)
        this.exchanges = {
            fanout: "events_fanout",
            topic: "events_topic",
            dlx: "dead_letter_exchange"
        };

        // Queues
        this.queues = {
            retry: 'retry_queue',
            deadLetter: 'dead_letter_queue'
        };

        // Config
        this.config = {
            prefetchCount: PREFETCH_COUNT,
            reconnectInterval: RECONNECT_INTERVAL_BASE
        };
    }

    /**
     * Connect with incremental backoff logic for initial startup resilience.
     * Ensures services don't crash if RabbitMQ is still warming up.
     * @returns {Promise<this>}
     */
    async connect() {
        if (this.isConnected && this.channel) return this;

        const maxAttempts = 10;
        let attempt = 1;

        while (attempt <= maxAttempts) {
            try {
                console.log(`RabbitMQ: Connection attempt ${attempt}/${maxAttempts}...`);
                this.connection = await amqp.connect(RABBITMQ_URL, {
                    heartbeat: 30,
                    clientProperties: {
                        connection_name: `invexis-service-${uuidv4().substring(0, 8)}`
                    }
                });

                this.channel = await this.connection.createChannel();
                await this.channel.prefetch(this.config.prefetchCount);

                await this.setupInfrastructure();
                this.isConnected = true;
                this.reconnectAttempts = 0;
                console.log('RabbitMQ: Connected successfully');

                // Event listeners for runtime failures
                this.connection.on('close', () => this.handleReconnect());
                this.connection.on('error', (err) => this.handleError(err));
                this.channel.on('error', (err) => this.handleError(err));
                this.channel.on('close', () => this.handleReconnect());

                return this;
            } catch (err) {
                console.error(`RabbitMQ: Connection attempt ${attempt} failed: ${err.message}`);

                if (attempt === maxAttempts) {
                    console.error('RabbitMQ: Maximum connection attempts reached. Failing.');
                    this.isConnected = false;
                    throw err;
                }

                // Exponential backoff with jitter
                const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 15000);
                console.log(`RabbitMQ: Retrying in ${Math.round(delay)}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                attempt++;
            }
        }
    }

    /**
     * Setup exchanges, queues, and bindings idempotently.
     * @private
     */
    async setupInfrastructure() {
        try {
            // Exchanges (durable, auto-delete false for persistence)
            await this.channel.assertExchange(this.exchanges.fanout, 'fanout', { durable: true, autoDelete: false });
            await this.channel.assertExchange(this.exchanges.topic, 'topic', { durable: true, autoDelete: false });
            await this.channel.assertExchange(this.exchanges.dlx, 'topic', { durable: true, autoDelete: false });

            // Dead Letter Queue (durable)
            await this.channel.assertQueue(this.queues.deadLetter, { durable: true });
            await this.channel.bindQueue(this.queues.deadLetter, this.exchanges.dlx, '#');

            // Retry Queue (durable, DLX, TTL for retry delay)
            await this.channel.assertQueue(this.queues.retry, {
                durable: true,
                deadLetterExchange: this.exchanges.dlx,
                deadLetterRoutingKey: this.queues.deadLetter,
                messageTtl: RETRY_DELAY,
                arguments: {
                    'x-dead-letter-exchange': this.exchanges.dlx,
                    'x-dead-letter-routing-key': this.queues.deadLetter
                }
            });

            // Bind retry to exchanges
            await this.channel.bindQueue(this.queues.retry, this.exchanges.topic, 'retry.#');
            await this.channel.bindQueue(this.queues.retry, this.exchanges.fanout, '');
            await this.channel.bindQueue(this.queues.retry, this.exchanges.dlx, '#');

            console.log('RabbitMQ: Infrastructure setup complete');
        } catch (err) {
            console.error('RabbitMQ: Setup failed', err.message);
            throw err;
        }
    }

    /**
     * Create a queue with DLQ support (idempotent).
     * @param {string} queueName - Queue name.
     * @param {object} options - Options (durable, TTL, etc.).
     * @returns {Promise<object>} Queue info.
     */
    async createQueue(queueName, options = {}) {
        const defaultOptions = {
            durable: true,
            arguments: {
                'x-dead-letter-exchange': this.exchanges.dlx,
                'x-dead-letter-routing-key': queueName
            }
        };
        return this.channel.assertQueue(queueName, { ...defaultOptions, ...options });
    }

    /**
     * Publish message with retries and headers.
     * @param {string} exchange - Exchange name.
     * @param {string} routingKey - Routing key.
     * @param {object} payload - Message payload.
     * @param {object} metadata - Headers (e.g., correlationId).
     * @returns {Promise<boolean>} Publish success.
     */
    async publish(exchange, routingKey, payload, metadata = {}) {
        if (!this.isConnected) await this.connect();
        try {
            const messageId = uuidv4();
            const headers = {
                ...metadata.headers || {},
                'x-retries': 0,
                'correlation-id': messageId,
                'timestamp': Date.now(),
                'content-type': 'application/json'
            };
            const message = Buffer.from(JSON.stringify(payload), 'utf8');
            const ok = this.channel.publish(
                exchange,
                routingKey,
                message,
                { persistent: true, messageId, headers, correlationId: messageId }
            );
            if (!ok) {
                console.warn('RabbitMQ: Publish failed - channel full');
                return false;
            }
            console.debug(`RabbitMQ: Published to ${exchange}/${routingKey}: ${messageId}`);
            return true;
        } catch (err) {
            console.error('RabbitMQ: Publish error', err.message);
            await this.handleReconnect();  // Trigger reconnect
            return false;
        }
    }

    /**
     * Subscribe to queue with consumer handler (supports multiple).
     * @param {object} queueConfig - { queue, exchange, pattern }.
     * @param {function} messageHandler - (content, routingKey) => Promise.
     * @returns {Promise<void>}
     */
    async subscribe(queueConfig, messageHandler) {
        if (!this.isConnected) await this.connect();
        try {
            const { queue, exchange, pattern } = queueConfig;
            await this.createQueue(queue);
            await this.channel.bindQueue(queue, exchange, pattern);

            const consumerTag = uuidv4();
            this.subscriptions.set(consumerTag, { queue, handler: messageHandler });

            this.channel.consume(queue, async (msg) => {
                if (!msg) return;
                try {
                    const content = this.parseMessage(msg);
                    const routingKey = msg.fields.routingKey;
                    const retries = msg.properties.headers?.['x-retries'] || 0;
                    await messageHandler(content, routingKey);
                    this.channel.ack(msg);
                    console.debug(`RabbitMQ: Acked message ${msg.properties.messageId} from ${queue}`);
                } catch (error) {
                    console.error('RabbitMQ: Consumer error', error.message);
                    await this.handleFailedMessage(msg, error);
                }
            }, { noAck: false, consumerTag });

            console.log(`RabbitMQ: Subscribed to ${queue} on ${exchange}/${pattern}`);
        } catch (err) {
            console.error('RabbitMQ: Subscribe error', err.message);
            throw err;
        }
    }

    async handleFailedMessage(msg, error) {
        const retries = msg.properties.headers?.['x-retries'] || 0;
        if (retries < RETRY_LIMIT) {
            console.log(`RabbitMQ: Retrying message ${msg.properties.messageId} (${retries + 1}/${RETRY_LIMIT})`);
            await this.retryMessage(msg);
        } else {
            console.error('RabbitMQ: Permanent failure for message', msg.properties.messageId, error.message);
            await this.sendToDlx(msg);
        }
    }

    async retryMessage(msg) {
        const updateHeaders = {
            ...msg.properties.headers,
            'x-retries': (msg.properties.headers?.['x-retries'] || 0) + 1
        };
        // Route retries via the topic exchange instead of publishing directly
        // to a queue name on the default exchange. This avoids a 404 when the
        // queue hasn't been declared on the current channel. The retry queue
        // is bound to the topic exchange with pattern 'retry.#' in
        // `setupInfrastructure()` so publishing to `retry.<routingKey>` will
        // route the message into the retry queue.
        const originalRoutingKey = msg.fields?.routingKey || '';
        const retryRoutingKey = originalRoutingKey ? `retry.${originalRoutingKey}` : 'retry';
        try {
            const ok = this.channel.publish(
                this.exchanges.topic,
                retryRoutingKey,
                msg.content,
                { headers: updateHeaders, persistent: true }
            );
            if (!ok) console.warn('RabbitMQ: retry publish returned false (buffer full)');
            this.channel.ack(msg);
        } catch (err) {
            console.error('RabbitMQ: Retry publish failed', err.message);
            // Fallback: send to DLX so the message isn't lost and avoid crashing
            try {
                await this.sendToDlx(msg);
            } catch (dlxErr) {
                console.error('RabbitMQ: Failed to send to DLX as fallback', dlxErr.message);
                // As a last resort, ack to avoid blocking the consumer
                try { this.channel.ack(msg); } catch (ackErr) { console.error('RabbitMQ: Ack failed', ackErr.message); }
            }
        }
    }

    async sendToDlx(msg) {
        await this.channel.publish(
            this.exchanges.dlx,
            msg.fields.routingKey,
            msg.content,
            { persistent: true }
        );
        this.channel.ack(msg);
    }

    parseMessage(msg) {
        try {
            return JSON.parse(msg.content.toString('utf8'));
        } catch (err) {
            console.error('RabbitMQ: Parse error', err.message);
            throw new Error('Invalid message format');
        }
    }

    handleReconnect() {
        if (this.reconnectTimeout || this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
        this.reconnectAttempts++;
        const delay = Math.min(this.config.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1), 30000);  // Exponential backoff, max 30s
        console.log(`RabbitMQ: Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
        this.reconnectTimeout = setTimeout(async () => {
            try {
                await this.connect();
                this.reconnectAttempts = 0;
            } catch (err) {
                console.error('RabbitMQ: Reconnect failed', err.message);
                this.handleReconnect();  // Retry
            }
        }, delay);
    }

    handleError(err) {
        console.error('RabbitMQ: Connection error', err.message);
        this.isConnected = false;
    }

    /**
     * Health check (for monitoring).
     * @returns {Promise<boolean>}
     */
    async healthCheck() {
        if (!this.isConnected) return false;
        try {
            await this.channel.checkQueue(this.queues.retry);
            return true;
        } catch (err) {
            return false;
        }
    }

    /**
     * Graceful close with subscription cleanup.
     * @returns {Promise<void>}
     */
    async close() {
        try {
            for (const [tag] of this.subscriptions) {
                await this.channel.cancel(tag);
            }
            this.subscriptions.clear();
            if (this.channel) await this.channel.close();
            if (this.connection) await this.connection.close();
            if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
            this.isConnected = false;
            console.log('RabbitMQ: Closed gracefully');
        } catch (err) {
            console.error('RabbitMQ: Close error', err.message);
        }
    }

    // ADDED: Direct consume without binding
    async consume(queueName, handler) {
        if (!this.isConnected) await this.connect();
        await this.createQueue(queueName);
        const tag = `direct-${Date.now()}`;
        return this.channel.consume(queueName, handler, { noAck: false, consumerTag: tag });
    }

}

// Singleton instance
const rabbitmq = new RabbitMQ();
process.on('SIGINT', () => rabbitmq.close());
process.on('SIGTERM', () => rabbitmq.close());

module.exports = {
    connect: () => rabbitmq.connect(),
    publish: (exchange, routingKey, payload, metadata) => rabbitmq.publish(exchange, routingKey, payload, metadata),
    subscribe: (queueConfig, messageHandler) => rabbitmq.subscribe(queueConfig, messageHandler),
    consume: (q, h) => rabbitmq.consume(q, h), // ADDED
    exchanges: rabbitmq.exchanges,
    queues: rabbitmq.queues,
    healthCheck: () => rabbitmq.healthCheck(),
};