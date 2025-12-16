#!/usr/bin/env node

/**
 * Quick Push Notification Test
 * Manually creates a notification with FCM token for testing
 */

require('dotenv').config();
const mongoose = require('mongoose');

const FCM_TOKEN = "fBBJ9h_rQ0aTfvc_QsKwkQ:APA91bEWcyIhGr41z7isTT-1rfH3udkQ2ecUiciw-oaFA2-Q1bx7I9QFoCi8AnT-sVGaXNQMU2i7CYx-PSrcFjTfOroqbuvv11J4iG5wzPju6_OkFsVCVuM";

async function testPushDirect() {
    console.log('\n🔔 Creating test push notification directly in DB...\n');

    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        const Notification = require('../src/models/Notification');

        // Create notification with push channel enabled
        const notification = await Notification.create({
            title: '🎉 Push Test - Direct Creation',
            body: 'If you see this on your device, push notifications are working perfectly!',
            type: 'test',
            templateName: 'default',
            userId: '000000000000000000000001',
            companyId: '00000000-0000-0000-0000-000000000001',
            scope: 'personal',
            status: 'pending',
            channels: {
                push: true,
                email: false,
                sms: false,
                inApp: false
            },
            payload: {
                fcmToken: FCM_TOKEN,
                test: true,
                timestamp: new Date().toISOString()
            }
        });

        console.log(`✅ Notification created: ${notification._id}`);
        console.log(`📱 FCM Token: ${FCM_TOKEN.substring(0, 20)}...`);

        // Queue for delivery
        const notificationQueue = require('../src/config/queue');
        await notificationQueue.add('deliver', {
            notificationId: notification._id
        });

        console.log('✅ Queued for delivery');
        console.log('\n📺 Watch notification service logs:');
        console.log('   docker-compose logs -f notification-service');
        console.log('\n📱 Check your device for the push notification!\n');

        setTimeout(async () => {
            await mongoose.disconnect();
            process.exit(0);
        }, 1000);

    } catch (error) {
        console.error('❌ Error:', error.message);
        await mongoose.disconnect();
        process.exit(1);
    }
}

testPushDirect();
