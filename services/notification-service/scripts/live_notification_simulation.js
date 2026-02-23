require('dotenv').config();
const amqp = require('amqplib');
const { v4: uuidv4 } = require('uuid');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const EXCHANGE = 'events_topic';

async function simulateLiveNotifications() {
    console.log('🚀 Starting Live Notification Simulation...');

    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();
    await channel.assertExchange(EXCHANGE, 'topic', { durable: true });

    // Targeting the active user found in DB
    const companyId = '46e5d562-34f2-4892-a83a-c9cf55b60006';
    const userId = '695e452eaa7d9d91f7fe426c';
    const departmentName = 'Main Store';

    const events = [
        {
            type: 'subscription.renewed',
            routingKey: 'subscription.renewed',
            data: {
                companyId,
                tier: 'Gold Plan',
                endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            }
        },
        {
            type: 'department_user.assigned',
            routingKey: 'department_user.assigned',
            data: {
                userId,
                departmentId: '65432109871111',
                departmentName,
                companyId,
                role: 'manager',
                performedByName: 'System Admin'
            }
        },
        {
            type: 'subscription.payment.failed',
            routingKey: 'subscription.payment.failed',
            data: {
                companyId,
                amount: 25000,
                reason: 'Expired card',
                paymentId: 'PAY-12345'
            }
        }
    ];

    for (const event of events) {
        const payload = {
            id: uuidv4(),
            source: 'live-simulation',
            type: event.type,
            data: event.data,
            emittedAt: new Date().toISOString()
        };

        console.log(`📡 Publishing ${event.type}...`);
        channel.publish(EXCHANGE, event.routingKey, Buffer.from(JSON.stringify(payload)));
        await new Promise(resolve => setTimeout(resolve, 3000)); // Gap between notifications
    }

    console.log('\n✅ Simulation complete. Check your devices/dashboard!');
    setTimeout(() => process.exit(0), 1000);
}

simulateLiveNotifications().catch(console.error);
