#!/usr/bin/env node

/**
 * Send Test Notification from Backend
 * This demonstrates the full backend → browser notification flow
 */

const amqp = require('amqplib');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://invexis:invexispass@localhost:5672';
const userId =  '69395ef2ed37e9e3614f370d';

async function sendNotification() {
    let connection, channel;

    try {
        console.log('\n🚀 Sending Backend Notification...\n');

        connection = await amqp.connect(RABBITMQ_URL);
        channel = await connection.createChannel();

        await channel.assertExchange('events_topic', 'topic', { durable: true });

        const notification = {
            data: {
                id: `backend-test-${Date.now()}`,
                title: '🎉 Backend Notification!',
                body: `This notification came from your backend at ${new Date().toLocaleTimeString()}. The full flow is working!`,
                type: 'success',
                timestamp: new Date().toISOString()
            },
            rooms: [],
            targetUserIds: [userId]
        };

        channel.publish(
            'events_topic',
            'realtime.notification',
            Buffer.from(JSON.stringify(notification)),
            { persistent: true, contentType: 'application/json' }
        );

        console.log('✅ Notification Sent!');
        console.log(`   Target: user:${userId}`);
        console.log(`   Title: ${notification.data.title}`);
        console.log('\n💡 Check your browser - you should see:');
        console.log('   1. Event log entry: "🔔 Notification Received"');
        console.log('   2. Browser notification popup\n');

        await channel.close();
        await connection.close();
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.code === 'ECONNREFUSED') {
            console.error('\n💡 Make sure RabbitMQ is running:');
            console.error('   docker-compose up -d rabbitmq\n');
        }
        if (connection) await connection.close();
        process.exit(1);
    }
}

sendNotification();
