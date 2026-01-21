#!/usr/bin/env node

/**
 * Direct Push Notification Test
 * 
 * This script sends a push notification directly to a specific FCM token
 * to verify the Firebase integration is working end-to-end.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const admin = require('firebase-admin');
const path = require('path');
const connectDB = require('../src/config/db');

// Firebase Admin SDK initialization
const serviceAccountPath = path.join(__dirname, '../invexis-94bf5-firebase-adminsdk-fbsvc-2e1e699c1a.json');

if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath)
        });
        console.log('✅ Firebase Admin SDK initialized');
    } catch (error) {
        console.error('❌ Failed to initialize Firebase:', error.message);
        process.exit(1);
    }
}

const messaging = admin.messaging();

async function testDirectPush() {
    try {
        console.log('\n🚀 Starting Direct Push Notification Test...\n');

        // Connect to MongoDB using the existing config
        console.log('📡 Connecting to MongoDB...');
        await connectDB();
        console.log('✅ Connected to MongoDB\n');

        // Get UserDevice model
        const UserDevice = require('../src/models/UserDevice');

        // Find the most recent device
        const devices = await UserDevice.find({ isActive: true })
            .sort({ createdAt: -1 })
            .limit(5);

        if (devices.length === 0) {
            console.log('❌ No active devices found in database!');
            console.log('💡 Make sure the frontend has successfully registered an FCM token.');
            process.exit(1);
        }

        console.log(`📱 Found ${devices.length} active device(s):\n`);
        devices.forEach((device, index) => {
            console.log(`${index + 1}. User: ${device.userId}`);
            console.log(`   Token: ${device.fcmToken.substring(0, 30)}...`);
            console.log(`   Type: ${device.deviceType}`);
            console.log(`   Name: ${device.deviceName}`);
            console.log(`   Last Active: ${device.lastActiveAt}\n`);
        });

        // Use the most recent device
        const targetDevice = devices[0];
        const fcmToken = targetDevice.fcmToken;

        console.log('--------------------------------------------------');
        console.log(`🎯 Sending test notification to device 1...`);
        console.log(`   User ID: ${targetDevice.userId}`);
        console.log(`   Device: ${targetDevice.deviceName}\n`);

        // Prepare the notification payload
        const message = {
            token: fcmToken,
            notification: {
                title: '🔔 Test Notification from Invexis',
                body: 'If you see this, your push notifications are working perfectly! 🎉'
            },
            data: {
                type: 'test',
                timestamp: new Date().toISOString(),
                source: 'test-direct-push-script'
            },
            webpush: {
                notification: {
                    icon: '/icon-192x192.png',
                    badge: '/badge-72x72.png',
                    requireInteraction: false,
                    tag: 'test-notification'
                },
                fcmOptions: {
                    link: '/'
                }
            }
        };

        // Send the notification
        const response = await messaging.send(message);

        console.log('✅ Push notification sent successfully!');
        console.log(`📬 Message ID: ${response}\n`);
        console.log('--------------------------------------------------');
        console.log('💡 CHECK YOUR DEVICE NOW!');
        console.log('   You should see a notification popup.');
        console.log('   If you don\'t see it:');
        console.log('   1. Check browser notification permissions');
        console.log('   2. Ensure the browser tab is open (or service worker is active)');
        console.log('   3. Check browser console for errors\n');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.code) {
            console.error(`   Error Code: ${error.code}`);
        }
        if (error.errorInfo) {
            console.error(`   Details: ${JSON.stringify(error.errorInfo, null, 2)}`);
        }
        process.exit(1);
    } finally {
        console.log('\n✅ Test completed!');
        process.exit(0);
    }
}

testDirectPush();
