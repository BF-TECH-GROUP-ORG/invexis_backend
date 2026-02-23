require('dotenv').config();
const amqp = require('amqplib');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const ShopSchedule = require('../src/models/ShopSchedule');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const EXCHANGE = 'events_topic';

async function testShopNotifications() {
    console.log('🧪 Testing shop notifications...');

    // Connect to RabbitMQ
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();
    await channel.assertExchange(EXCHANGE, 'topic', { durable: true });

    // Connect to MongoDB to verify schedule sync
    if (process.env.MONGO_URI) {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('📦 Connected to MongoDB');
    } else {
        console.warn('⚠️ MONGO_URI not set, skipping DB verification');
    }

    const shopId = `SHOP-TEST-${Date.now()}`;
    const companyId = '46e5d562-34f2-4892-a83a-c9cf55b60006'; // Use verified company ID

    // 1. Publish shop.created
    const shopCreatedEvent = {
        id: `test-shop.created-${Date.now()}`,
        source: 'test-script',
        type: 'shop.created',
        data: {
            shopId,
            companyId,
            shopName: 'Test Coffee Shop',
            timezone: 'Africa/Kigali',
            performedByName: 'Tester',
            createdAt: new Date().toISOString()
        },
        emittedAt: new Date().toISOString()
    };

    console.log(`\n🏪 Test: shop.created`);
    console.log('──────────────────────────────────────────────────');
    console.log(JSON.stringify(shopCreatedEvent, null, 2));

    channel.publish(EXCHANGE, 'shop.created', Buffer.from(JSON.stringify(shopCreatedEvent)));
    console.log('✅ shop.created event published');

    await new Promise(resolve => setTimeout(resolve, 2000));

    // 2. Publish shop.operating_hours.updated
    // Calculate a time 15 minutes from now to test the reminder
    const now = new Date();
    const options = { timeZone: 'Africa/Kigali', hour12: false, hour: '2-digit', minute: '2-digit', weekday: 'short' };
    const formatter = new Intl.DateTimeFormat('en-US', options);

    // We want the reminder to trigger, so we set open_time to NOW + 15 mins
    const future = new Date(now.getTime() + 15 * 60000);
    const parts = formatter.formatToParts(future);
    const hour = parts.find(p => p.type === 'hour').value;
    const minute = parts.find(p => p.type === 'minute').value;
    const weekday = parts.find(p => p.type === 'weekday').value;
    const dayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
    const day = dayMap[weekday];
    const timeStr = `${hour}:${minute}`;

    console.log(`\n🕒 Setting open_time to ${timeStr} (in 15 mins) for day ${day}`);

    const hoursEvent = {
        id: `test-shop.hours-${Date.now()}`,
        source: 'test-script',
        type: 'shop.operating_hours.updated',
        data: {
            shopId,
            companyId,
            timezone: 'Africa/Kigali',
            operatingHours: [
                { day_of_week: day, open_time: timeStr, close_time: '22:00' }
            ]
        },
        emittedAt: new Date().toISOString()
    };

    console.log(`\n⏰ Test: shop.operating_hours.updated`);
    console.log('──────────────────────────────────────────────────');
    console.log(JSON.stringify(hoursEvent, null, 2));

    channel.publish(EXCHANGE, 'shop.operating_hours.updated', Buffer.from(JSON.stringify(hoursEvent)));
    console.log('✅ shop.operating_hours.updated event published');

    // Wait for sync
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify MongoDB Sync
    if (mongoose.connection.readyState === 1) {
        const schedule = await ShopSchedule.findOne({ shopId });
        if (schedule) {
            console.log(`\n✅ Verified ShopSchedule sync:`);
            console.log(`   ID: ${schedule.shopId}`);
            console.log(`   Name: ${schedule.shopName}`);
            console.log(`   Hours: ${JSON.stringify(schedule.operatingHours)}`);
        } else {
            console.error(`\n❌ ShopSchedule NOT found for ${shopId}`);
        }
    }

    // 3. Test shop.deleted (Cleanup)
    const deleteEvent = {
        id: `test-shop.deleted-${Date.now()}`,
        source: 'test-script',
        type: 'shop.deleted',
        data: {
            shopId,
            companyId,
            shopName: 'Test Coffee Shop',
            performedByName: 'Tester'
        },
        emittedAt: new Date().toISOString()
    };

    // NOTE regarding scheduler test:
    // The scheduler runs every minute. 
    // You should check the notification-service logs to see if it picked up the schedule and sent a reminder.
    // "⏰ Found 1 shops opening at HH:mm..."

    console.log(`\n🗑️ Test: shop.deleted (Delayed cleanup to allow scheduler test)`);
    console.log('   Skipping delete to allow manual scheduler verification.');
    // channel.publish(EXCHANGE, 'shop.deleted', Buffer.from(JSON.stringify(deleteEvent)));

    setTimeout(() => {
        console.log('\n🏁 Test script finished. Check Docker logs for reminder dispatch.');
        process.exit(0);
    }, 1000);
}

testShopNotifications().catch(console.error);
