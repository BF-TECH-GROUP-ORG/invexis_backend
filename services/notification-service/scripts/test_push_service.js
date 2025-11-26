#!/usr/bin/env node

/**
 * Alternative Push Test - Uses the notification service's push channel directly
 * This avoids re-initializing Firebase and uses the existing service setup
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Notification = require('../src/models/Notification');
const { sendPush } = require('../src/channels/push');

const TEST_FCM_TOKEN = process.env.TEST_FCM_TOKEN || "fBBJ9h_rQ0aTfvc_QsKwkQ:APA91bEWcyIhGr41z7isTT-1rfH3udkQ2ecUiciw-oaFA2-Q1bx7I9QFoCi8AnT-sVGaXNQMU2i7CYx-PSrcFjTfOroqbuvv11J4iG5wzPju6_OkFsVCVuM";

console.log('\n╔════════════════════════════════════════════════════╗');
console.log('║    Push Notification Test (Service Integration)   ║');
console.log('╚════════════════════════════════════════════════════╝\n');

async function testPush() {
    try {
        // Connect to MongoDB
        console.log('📋 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        // Create a test notification
        console.log('📋 Creating test notification...');
        const testNotification = await Notification.create({
            title: '🔔 Push Test from Invexis',
            body: 'If you see this, push notifications are working! 🎉',
            type: 'test',
            templateName: 'default',
            payload: {
                fcmToken: TEST_FCM_TOKEN,
                test: true,
                timestamp: new Date().toISOString()
            },
            channels: { push: true },
            status: 'pending',
            scope: 'personal',
            userId: '000000000000000000000001', // Dummy user ID for testing
            companyId: '00000000-0000-0000-0000-000000000001' // Dummy company ID
        });

        console.log(`✅ Notification created: ${testNotification._id}\n`);

        // Send push notification
        console.log('📋 Sending push notification...');
        console.log(`📱 Token (first 20 chars): ${TEST_FCM_TOKEN.substring(0, 20)}...\n`);

        const result = await sendPush(
            testNotification,
            TEST_FCM_TOKEN,
            testNotification.userId,
            testNotification.companyId
        );

        if (result.success) {
            console.log('✅ Push notification sent successfully!');
            console.log(`📨 Delivery log ID: ${result.logId}`);
            console.log('\n🎉 Check your device - you should see the notification!\n');
            process.exit(0);
        } else {
            console.log('❌ Push notification failed:');
            console.log(`   Error: ${result.error || 'Unknown error'}`);
            if (result.rateLimited) {
                console.log('   Reason: Rate limited');
            }
            if (result.circuitBreakerOpen) {
                console.log('   Reason: Circuit breaker open');
            }
            console.log();
            process.exit(1);
        }
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
    }
}

testPush();
