#!/usr/bin/env node

/**
 * Quick Push Test - Send directly to a specific FCM token
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const admin = require('firebase-admin');
const path = require('path');

// Firebase Admin SDK initialization
const serviceAccountPath = path.join(__dirname, '../invexis-94bf5-firebase-adminsdk-fbsvc-2e1e699c1a.json');

if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath)
        });
        console.log('✅ Firebase Admin SDK initialized\n');
    } catch (error) {
        console.error('❌ Failed to initialize Firebase:', error.message);
        process.exit(1);
    }
}

const messaging = admin.messaging();

// The FCM token from your frontend
const FCM_TOKEN = 'fPu9BYwviI6DwYZvxWSEVi:APA91bGEspcUpzJ-3fgt8H6VfX0d1cawi4-TB42TCFlrdreeur7_GqXSWPNDR_EpjYJgQRAnXTuobGh-M6HUd3wPgK_sXVlDaYWu2E24W2gm5Ig-z7xfb2s';

async function sendQuickPush() {
    try {
        console.log('🚀 Sending test push notification...\n');
        console.log(`📱 Target Device: Chrome on Linux`);
        console.log(`🎯 Token: ${FCM_TOKEN.substring(0, 30)}...\n`);

        // Prepare the notification payload
        const message = {
            token: FCM_TOKEN,
            notification: {
                title: '🎉 wacyana we uri igi karitasi mhn',
                body: 'Narababwiye ngewe ndi aatasa mnh'
            },
            data: {
                type: 'test',
                timestamp: new Date().toISOString(),
                source: 'quick-push-test',
                message: 'This is a test notification from your Invexis backend'
            },
            webpush: {
                notification: {
                    icon: '/icon-192x192.png',
                    badge: '/badge-72x72.png',
                    requireInteraction: true,
                    tag: 'invexis-test',
                    vibrate: [200, 100, 200]
                },
                fcmOptions: {
                    link: '/'
                }
            }
        };

        console.log('📤 Sending notification via Firebase...\n');

        // Send the notification
        const response = await messaging.send(message);

        console.log('✅ SUCCESS! Push notification sent!');
        console.log(`📬 Message ID: ${response}\n`);
        console.log('--------------------------------------------------');
        console.log('💡 CHECK YOUR BROWSER NOW!');
        console.log('   You should see a notification popup.');
        console.log('   Title: "🎉 Invexis Push Notification Test"');
        console.log('   Body: "Success! Your push notifications are working perfectly! ✅"');
        console.log('--------------------------------------------------\n');

        process.exit(0);

    } catch (error) {
        console.error('\n❌ ERROR sending push notification:');
        console.error(`   Message: ${error.message}`);
        if (error.code) {
            console.error(`   Code: ${error.code}`);
        }
        if (error.errorInfo) {
            console.error(`   Details: ${JSON.stringify(error.errorInfo, null, 2)}`);
        }
        console.log('\n💡 Common issues:');
        console.log('   - Invalid FCM token (token expired or revoked)');
        console.log('   - Firebase project mismatch');
        console.log('   - Browser notification permissions not granted\n');
        process.exit(1);
    }
}

sendQuickPush();
