require('dotenv').config();
const amqp = require('amqplib');
const { v4: uuidv4 } = require('uuid');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const EXCHANGE = 'events_topic';

async function testSubscriptionNotifications() {
    console.log('🧪 Testing Subscription Notifications...');

    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();
    await channel.assertExchange(EXCHANGE, 'topic', { durable: true });

    const companyId = '46e5d562-34f2-4892-a83a-c9cf55b60006'; // Verified Company
    const subscriptionId = `SUB-${Date.now()}`;

    // 0. Test Creation
    const createEvent = {
        id: uuidv4(),
        source: 'test-script',
        type: 'subscription.created',
        data: {
            subscriptionId,
            companyId,
            tier: 'premium',
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        },
        emittedAt: new Date().toISOString()
    };

    console.log(`\n🎉 Publishing subscription.created`);
    channel.publish(EXCHANGE, 'subscription.created', Buffer.from(JSON.stringify(createEvent)));

    await new Promise(resolve => setTimeout(resolve, 2000));

    // 1. Test Renewal
    const renewEvent = {
        id: uuidv4(),
        source: 'test-script',
        type: 'subscription.renewed',
        data: {
            subscriptionId,
            companyId,
            tier: 'premium',
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            renewedAt: new Date().toISOString()
        },
        emittedAt: new Date().toISOString()
    };

    console.log(`\n🔄 Publishing subscription.renewed`);
    channel.publish(EXCHANGE, 'subscription.renewed', Buffer.from(JSON.stringify(renewEvent)));

    await new Promise(resolve => setTimeout(resolve, 2000));

    // 2. Test Expiration
    const expireEvent = {
        id: uuidv4(),
        source: 'test-script',
        type: 'subscription.expired',
        data: {
            subscriptionId,
            companyId,
            expiredAt: new Date().toISOString()
        },
        emittedAt: new Date().toISOString()
    };

    console.log(`\n🚨 Publishing subscription.expired`);
    channel.publish(EXCHANGE, 'subscription.expired', Buffer.from(JSON.stringify(expireEvent)));

    await new Promise(resolve => setTimeout(resolve, 2000));

    // 3. Test Payment Failure
    const failEvent = {
        id: uuidv4(),
        source: 'test-script',
        type: 'subscription.payment.failed',
        data: {
            subscriptionId,
            companyId,
            amount: 50000,
            reason: 'Insufficient funds',
            paymentId: `PAY-FAIL-${Date.now()}`
        },
        emittedAt: new Date().toISOString()
    };

    console.log(`\n❌ Publishing subscription.payment.failed`);
    channel.publish(EXCHANGE, 'subscription.payment.failed', Buffer.from(JSON.stringify(failEvent)));

    console.log('\n🏁 Events published. Check logs for dispatch confirmation.');
    setTimeout(() => process.exit(0), 1000);
}

testSubscriptionNotifications().catch(console.error);
