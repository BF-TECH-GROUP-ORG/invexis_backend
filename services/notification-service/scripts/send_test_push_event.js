#!/usr/bin/env node

/**
 * Send test push notification via RabbitMQ (works with Docker)
 * This publishes an event that the notification service will consume
 */

const amqp = require('amqplib');

const FCM_TOKEN = "fBBJ9h_rQ0aTfvc_QsKwkQ:APA91bEWcyIhGr41z7isTT-1rfH3udkQ2ecUiciw-oaFA2-Q1bx7I9QFoCi8AnT-sVGaXNQMU2i7CYx-PSrcFjTfOroqbuvv11J4iG5wzPju6_OkFsVCVuM";

async function sendTestPushEvent() {
    console.log('\n🔔 Sending test push notification via RabbitMQ...\n');

    try {
        // Connect to RabbitMQ
        const connection = await amqp.connect('amqp://invexis:invexispass@localhost:5672');
        const channel = await connection.createChannel();

        const exchange = 'events_topic';
        const routingKey = 'notification.test';

        // Ensure exchange exists
        await channel.assertExchange(exchange, 'topic', { durable: true });

        // Create test event payload
        const event = {
            type: 'notification.direct',
            data: {
                userId: '673f2c80c6b9b5a7cdfe1234', // Test user ID
                companyId: '12345678-1234-1234-1234-123456789012', // Test company ID
                title: '🔔 Push Test from Invexis!',
                body: 'If you see this, push notifications are working! 🎉',
                channels: { push: true, inApp: false },
                payload: {
                    fcmToken: FCM_TOKEN,
                    test: true,
                    timestamp: new Date().toISOString()
                },
                templateName: 'default'
            }
        };

        // Publish event
        channel.publish(
            exchange,
            routingKey,
            Buffer.from(JSON.stringify(event)),
            { persistent: true }
        );

        console.log('✅ Event published to RabbitMQ');
        console.log(`📨 Exchange: ${exchange}`);
        console.log(`🔑 Routing Key: ${routingKey}`);
        console.log(`📱 FCM Token: ${FCM_TOKEN.substring(0, 20)}...`);
        console.log('\n📺 Watch the notification-service logs:');
        console.log('   docker-compose logs -f notification-service\n');
        console.log('📱 Check your device for the push notification!\n');

        setTimeout(() => {
            connection.close();
            process.exit(0);
        }, 500);

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

sendTestPushEvent();
