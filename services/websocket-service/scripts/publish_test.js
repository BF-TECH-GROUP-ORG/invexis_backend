// scripts/publish_test.js
// Simple helper to publish test messages to RabbitMQ via shared rabbitmq publish helper

const publisher = require('../src/publishers/publisher');

const EXCHANGE = process.env.EVENTS_EXCHANGE || 'events_topic';

async function run() {
    try {
        console.log('Publishing single-user event...');
        await publisher.publishToUser(EXCHANGE, 'test-user-123', {
            event: 'notification.sent',
            data: { message: 'Hello user test-user-123', level: 'info' }
        });

        console.log('Publishing room event...');
        await publisher.publishToRoom(EXCHANGE, 'room:general', {
            event: 'room.message',
            data: { message: 'Hello room general', sender: 'script' }
        });

        console.log('Publishing broadcast event...');
        await publisher.publishBroadcast(EXCHANGE, {
            event: 'system.announcement',
            data: { message: 'This is a broadcast message to all clients' }
        });

        console.log('All test messages published');
    } catch (err) {
        console.error('Publish test failed:', err && err.stack ? err.stack : err);
        process.exit(1);
    }
}

run();
