const amqp = require("amqplib");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://invexis:invexispass@rabbitmq:5672";
const RETRY_LIMIT = 3;
const RETRY_DELAY = 5000;

class RabbitMQ {
    constructor() {
        this.connection = null;
        this.channel = null;
        this.exchanges = {
            fanout: "events_fanout",
            topic: "events_topic",
            dlx: "dead_letter_exchange"
        };
        this.queue = {
            retry: 'retry_queue'
        };
        this.config = {
            prefetchCount: 10,
            reconnectInterval: 5000
        };
        this.reconnectTimeout = null;
    }

    async connect() {
        // connecting method
        try {
            if (this.connection) return this;
            this.connection = await amqp.connect(RABBITMQ_URL);

            this.channel = await this.connection.createChannel();
            await this.setupInfrastructure();
            await this.channel.prefetch(this.config.prefetchCount);

            await this.channel.assertExchange(this.exchanges.fanout, "fanout", { durable: true });
            await this.channel.assertExchange(this.exchanges.dlx, "topic", { durable: true });
            await this.channel.assertQueue(this.queue.retry, { durable: true });
            await this.channel.bindQueue(this.queue.retry, this.exchanges.dlx, "#");
            await this.channel.bindQueue(this.queue.retry, this.exchanges.topic, "retry.#");
            await this.channel.bindQueue(this.queue.retry, this.exchanges.fanout, "");

            this.connection.on('close', () => this.handleReconnect());
            this.connection.on('error', (err) => this.handleError(err));
            console.log("Rabbitmq connected successfully");
            return this;

        } catch (err) {
            console.error("RabbitMQ connection failed", err.message);
            throw err;
        }
    }

    async setupInfrastructure() {
        await this.channel.assertExchange(this.exchanges.fanout, 'fanout', { durable: true, autoDelete: false });

        await this.channel.assertExchange(this.exchanges.topic, 'topic', { durable: true, autoDelete: false });

        await this.channel.assertExchange(this.exchanges.dlx, 'topic', { durable: true, autoDelete: false });

        await this.channel.assertQueue(this.queue.retry, {
            durable: true,
            deadLetterExchange: this.exchanges.dlx,
            messageTtl: RETRY_DELAY,
        });

        await this.channel.assertQueue('dead_letter_queue', { durable: true });

        await this.channel.bindQueue(
            'dead_letter_queue',
            this.exchanges.dlx,
            '#'
        );

        await this.channel.bindQueue(this.queue.retry, this.exchanges.topic, 'retry.#');
        await this.channel.bindQueue(this.queue.retry, this.exchanges.fanout, '');
        await this.channel.bindQueue(this.queue.retry, this.exchanges.dlx, '#');
    }

    async createQueue(queueName, options = {}) {
        // create queues
        const defaultOptions = {
            durable: true,
            arguments: {
                'x-dead-letter-exchange': this.exchanges.dlx,
                'x-dead-letter-routing-key': queueName
            }
        };
        return this.channel.assertQueue(queueName, {
            ...defaultOptions,
            ...options
        });
    }

    async publish(exchange, routingKey, payload, metadata = {}) {
        try {
            const messageId = uuidv4();
            const headers = {
                ...metadata.headers,
                'x-retries': 0
            };
            return this.channel.publish(
                exchange,
                routingKey,
                Buffer.from(JSON.stringify(payload)),
                { persistent: true, messageId, headers, ...metadata }
            );
        } catch (err) {
            console.error("RabbitMQ publish error:", err.message);
        }
    }

    async subscribe(queueConfig, messageHandler) {
        // A METHOD THAT ALLOW SERVICES TO LISTEN AND CONSUME EVENTS FROM QUEUES
        try {
            const { queue, exchange, pattern } = queueConfig;
            await this.createQueue(queue);
            await this.channel.bindQueue(queue, exchange, pattern);
            this.channel.consume(queue, async (msg) => {
                try {
                    if (!msg) return;
                    const content = this.parseMessage(msg);
                    const retries = msg.properties.headers['x-retries'] || 0;
                    await messageHandler(content, msg.fields.routingKey);
                    this.channel.ack(msg);
                } catch (error) {
                    await this.handleFailedMessage(msg, error);
                }
            }, { noAck: false });
        } catch (err) {
            console.log('rabbitmq subscribe error:', err.message);
            throw err;
        }
    }

    async handleFailedMessage(msg, error) {
        //HANDLES FAILED MESSAGE BY RETRYING THEM OR SENDING MSGS IN DLX
        const retries = msg.properties.headers['x-retries'] || 0;
        if (retries < RETRY_LIMIT) {
            console.log(`rabbitmq retrying message (${retries + 1}/${RETRY_LIMIT})`);
            await this.retryMessage(msg);
        } else {
            console.log('rabbitmq message failed Permanently', error.message);
            await this.sendToDlx(msg);
        }
    }

    async retryMessage(msg) {
        // A FUNCTION THAT HANDLES RETRYING AND UPDATES RETRY COUNT
        const updateHeaders = {
            ...msg.properties.headers,
            'x-retries': (msg.properties.headers['x-retries'] || 0) + 1
        };
        await this.channel.publish(
            '',
            this.queue.retry,
            msg.content,
            {
                headers: updateHeaders,
                persistent: true
            }
        );
        this.channel.ack(msg);
    }

    async sendToDlx(msg) {
        //A METHOD THAT SENDS FAILED MESSAGES TO DEAD LETTER EXCHANGE
        await this.channel.publish(
            this.exchanges.dlx,
            msg.fields.routingKey,
            msg.content,
            { persistent: true }
        );
        this.channel.ack(msg);
    }

    parseMessage(msg) {
        //A METHOD THAT PARSES MESSAGES
        try {
            return JSON.parse(msg.content.toString());
        } catch (err) {
            throw new Error("Invalid message format", err);
        }
    }

    handleReconnect() {
        // A METHOD THAT HANDLES RECONNECTION
        if (this.reconnectTimeout) return;
        console.log(`rabbitmq reconnecting in ${this.config.reconnectInterval / 1000}s ...`);
        this.reconnectTimeout = setTimeout(
            () => this.connect(),
            this.config.reconnectInterval
        );
    }

    handleError(err) {
        //A FUNCTION THAT HANDLES ERROR
        console.log("RabbitMQ connection error:", err.message);
    }

    async close() {
        //A FUNCTION THAT HANDLES GRACEFUL CLOSING 
        try {
            if (this.channel) await this.channel.close();
            if (this.connection) await this.connection.close();
            if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
            console.log("rabbitmq connection closed gracefully");
        } catch (err) {
            console.log('rabbitmq close error', err.message);
        }
    }
}

const rabbitmq = new RabbitMQ();
process.on("SIGINT", () => rabbitmq.close());
process.on("SIGTERM", () => rabbitmq.close());

module.exports = {
    connect: () => rabbitmq.connect(),
    publish: (exchange, routingKey, payload, metadata) => rabbitmq.publish(exchange, routingKey, payload, metadata),
    subscribe: (queueConfig, messageHandler) => rabbitmq.subscribe(queueConfig, messageHandler),
    exchanges: rabbitmq.exchanges
};