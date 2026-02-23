#!/usr/bin/env node
const path = require('path');
process.env.RABBITMQ_URL = 'amqp://invexis:invexispass@localhost:5673';
const rabbitmqPath = path.join(__dirname, '../../../shared/rabbitmq');
const { subscribe, connect, exchanges } = require(rabbitmqPath);

async function listen() {
    console.log('👂 Listening for ALL events on RabbitMQ (localhost:5673)...');

    try {
        await connect();
        console.log('✅ Connected to RabbitMQ');

        await subscribe({
            queue: 'debug_listener_queue_' + Date.now(),
            exchange: exchanges.topic,
            pattern: '#'
        }, (event, routingKey) => {
            console.log(`\n📥 RECEIVED [${routingKey}]:`);
            console.log(JSON.stringify(event, null, 2));
        });

        console.log('🚀 Listener ready. Send some events!');
    } catch (error) {
        console.error('❌ Failed:', error.message);
    }
}

listen();
