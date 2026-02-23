require('dotenv').config();
const amqp = require('amqplib');
const mongoose = require('mongoose');
const ShopSchedule = require('../src/models/ShopSchedule');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const EXCHANGE = 'events_topic';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://invexis-mongo:27017/invexis_notification';

async function testTimezoneUpdate() {
    console.log('🧪 Testing Shop Timezone Update...');

    // Connect to RabbitMQ
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();
    await channel.assertExchange(EXCHANGE, 'topic', { durable: true });

    // Connect to MongoDB
    await mongoose.connect(MONGO_URI);
    console.log('📦 Connected to MongoDB');

    const shopId = `SHOP-TZ-TEST-${Date.now()}`;
    const companyId = '46e5d562-34f2-4892-a83a-c9cf55b60006';

    // 1. Create initial schedule (default timezone)
    await ShopSchedule.findOneAndUpdate(
        { shopId },
        {
            $set: {
                shopId,
                companyId,
                shopName: 'Timezone Test Shop',
                timezone: 'Africa/Kigali', // Initial
                operatingHours: []
            }
        },
        { upsert: true }
    );
    console.log(`✅ Created initial schedule for ${shopId} with timezone: Africa/Kigali`);

    // 2. Publish shop.updated with NEW timezone
    const updatedEvent = {
        id: `test-shop.updated-${Date.now()}`,
        source: 'test-script',
        type: 'shop.updated',
        data: {
            shopId,
            companyId,
            shopName: 'Timezone Test Shop Updated',
            timezone: 'Europe/London', // NEW TIMEZONE
            performedByName: 'Tester',
            updatedAt: new Date().toISOString()
        },
        emittedAt: new Date().toISOString()
    };

    console.log(`\n📤 Publishing shop.updated with timezone: Europe/London`);
    channel.publish(EXCHANGE, 'shop.updated', Buffer.from(JSON.stringify(updatedEvent)));

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 3. Verify Update
    const schedule = await ShopSchedule.findOne({ shopId });
    if (schedule && schedule.timezone === 'Europe/London') {
        console.log(`\n✅ SUCCESS: Timezone updated to ${schedule.timezone}`);
    } else {
        console.error(`\n❌ FAILED: Timezone is ${schedule ? schedule.timezone : 'not found'}`);
        process.exit(1);
    }

    process.exit(0);
}

testTimezoneUpdate().catch(console.error);
