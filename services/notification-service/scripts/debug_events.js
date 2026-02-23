#!/usr/bin/env node
const path = require('path');
const { subscribe, connect, exchanges } = require('../src/utils/rabbitmq'); // Adjusted path

async function listen() {
    console.log('👂 Debug listener starting...');

    try {
        await connect();
        console.log('✅ Connected to RabbitMQ');

        await subscribe({
            queue: 'debug_listener_' + Date.now(),
            exchange: exchanges.topic,
            pattern: '#'
        }, (event, routingKey) => {
            console.log(`\n📥 RECEIVED [${routingKey}]:`);
            console.log(JSON.stringify(event, null, 2));
        });

        console.log('🚀 Listener ready. Monitoring all events...');
    } catch (error) {
        console.error('❌ Failed:', error.message);
    }
}

listen();
