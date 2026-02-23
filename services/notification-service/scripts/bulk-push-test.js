#!/usr/bin/env node

/**
 * Bulk Push Test - Send to all active devices in the database
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const admin = require('firebase-admin');
const path = require('path');
const connectDB = require('../src/config/db');
const UserDevice = require('../src/models/UserDevice');

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

async function runBulkTest() {
    try {
        // Connect to Database
        await connectDB();
        console.log('✅ Connected to MongoDB');

        // Fetch all active devices
        const devices = await UserDevice.find({ isActive: true });
        console.log(`🔍 Found ${devices.length} active device(s) in database\n`);

        if (devices.length === 0) {
            console.log('⚠️ No active devices found. Exiting.');
            process.exit(0);
        }

        const results = {
            success: 0,
            failure: 0,
            cleanup: 0
        };

        for (const device of devices) {
            console.log(`🚀 Sending to device: ${device.deviceName || 'Unknown'} (User: ${device.userId})`);
            console.log(`🎯 Token: ${device.fcmToken.substring(0, 30)}...`);

            const message = {
                token: device.fcmToken,
                notification: {
                    title: '🎉 Invexis System Test',
                    body: 'Your push notifications are being verified. ✅'
                },
                data: {
                    type: 'test',
                    timestamp: new Date().toISOString(),
                    source: 'bulk-push-test'
                },
                webpush: {
                    notification: {
                        icon: '/icon-192x192.png',
                        requireInteraction: true,
                        tag: 'invexis-test'
                    },
                    fcmOptions: {
                        link: '/'
                    }
                }
            };

            try {
                const response = await messaging.send(message);
                console.log(`✅ Sent! Message ID: ${response}\n`);
                results.success++;
            } catch (error) {
                console.error(`❌ FAILED for token ${device.fcmToken.substring(0, 10)}...: ${error.message}`);
                results.failure++;

                // If token is invalid, suggest cleanup
                if (error.code === 'messaging/registration-token-not-registered' ||
                    error.code === 'messaging/invalid-argument') {
                    console.log(`🗑️ Token appears to be invalid. Marking as inactive.`);
                    await UserDevice.updateOne({ _id: device._id }, { isActive: false });
                    results.cleanup++;
                }
                console.log('');
            }
        }

        console.log('--------------------------------------------------');
        console.log('📊 BULK TEST RESULTS:');
        console.log(`✅ Success: ${results.success}`);
        console.log(`❌ Failure: ${results.failure}`);
        console.log(`🧹 Cleaned up: ${results.cleanup}`);
        console.log('--------------------------------------------------\n');

        process.exit(0);
    } catch (error) {
        console.error('💥 Fatal error during bulk test:', error);
        process.exit(1);
    }
}

runBulkTest();
