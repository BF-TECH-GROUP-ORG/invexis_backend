#!/usr/bin/env node

/**
 * Push Notification Test Script
 * Tests push notifications without needing a frontend app
 * 
 * Usage:
 *   export TEST_FCM_TOKEN="your_fcm_token_here"
 *   node scripts/test_push_notifications.js
 */

require('dotenv').config();
const admin = require('firebase-admin');
const path = require('path');

console.log('\n╔════════════════════════════════════════════════════╗');
console.log('║      Push Notification Testing (No Frontend)      ║');
console.log('╚════════════════════════════════════════════════════╝\n');

// Get test token from environment or use a placeholder
const TEST_FCM_TOKEN = process.env.TEST_FCM_TOKEN;

if (!TEST_FCM_TOKEN) {
    console.log('⚠️  No TEST_FCM_TOKEN provided.');
    console.log('\n📘 How to get an FCM token:\n');
    console.log('Option 1: Firebase Console');
    console.log('  1. Go to https://console.firebase.google.com');
    console.log('  2. Select project: invexis-b7713');
    console.log('  3. Cloud Messaging → Send test message\n');

    console.log('Option 2: Mobile Test App');
    console.log('  1. Install "FCM Test App" from Play Store');
    console.log('  2. Copy the FCM token from the app');
    console.log('  3. export TEST_FCM_TOKEN="token_here"\n');

    console.log('Option 3: Web Browser');
    console.log('  1. Create a simple HTML with Firebase SDK');
    console.log('  2. Call messaging().getToken()');
    console.log('  3. Use the returned token\n');

    console.log('💡 For now, will test Firebase configuration only...\n');
}

async function runTests() {
    let testsPassed = 0;
    let testsFailed = 0;

    // Test 1: Firebase Admin Initialization
    console.log('📋 Test 1: Firebase Admin SDK Configuration');
    console.log('─'.repeat(50));

    try {
        const serviceAccountPath = path.join(__dirname, '../invexis-b7713-firebase-adminsdk-fbsvc-82c17263cc.json');
        const fs = require('fs');

        if (fs.existsSync(serviceAccountPath)) {
            console.log('  ✅ Service account file found');

            const serviceAccount = require(serviceAccountPath);
            console.log(`  ✅ Project ID: ${serviceAccount.project_id}`);
            console.log(`  ✅ Client email: ${serviceAccount.client_email}`);

            // Initialize Firebase Admin
            if (!admin.apps.length) {
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount)
                });
            }
            console.log('  ✅ Firebase Admin initialized\n');
            testsPassed++;
        } else {
            console.log('  ❌ Service account file not found at:', serviceAccountPath);
            console.log('  📂 Expected path: invexis-b7713-firebase-adminsdk-fbsvc-82c17263cc.json\n');
            testsFailed++;
            return;
        }
    } catch (error) {
        console.log('  ❌ Firebase initialization error:', error.message, '\n');
        testsFailed++;
        return;
    }

    // Test 2: Direct FCM Message Send (if token provided)
    if (TEST_FCM_TOKEN) {
        console.log('📋 Test 2: Direct FCM Message Send');
        console.log('─'.repeat(50));

        try {
            const message = {
                notification: {
                    title: '🔔 Test Notification',
                    body: 'This is a test push notification from Invexis!'
                },
                data: {
                    test: 'true',
                    timestamp: new Date().toISOString(),
                    source: 'test_script'
                },
                token: TEST_FCM_TOKEN
            };

            console.log('  📤 Sending test message...');
            const startTime = Date.now();
            const response = await admin.messaging().send(message);
            const responseTime = Date.now() - startTime;

            console.log(`  ✅ Message sent successfully`);
            console.log(`  📨 Message ID: ${response}`);
            console.log(`  ⏱️  Response time: ${responseTime}ms`);
            console.log(`  📱 Token (first 10 chars): ${TEST_FCM_TOKEN.substring(0, 10)}...`);
            console.log(`  💬 Title: "${message.notification.title}"`);
            console.log(`  💬 Body: "${message.notification.body}"\n`);
            testsPassed++;
        } catch (error) {
            console.log(`  ❌ Send failed: ${error.message}`);
            console.log(`  🔍 Error code: ${error.code || 'unknown'}`);

            if (error.code === 'messaging/invalid-registration-token') {
                console.log('  💡 Tip: Token might be expired or invalid. Get a fresh one.');
            } else if (error.code === 'messaging/registration-token-not-registered') {
                console.log('  💡 Tip: App might be uninstalled. Get a new token from a fresh install.');
            }
            console.log();
            testsFailed++;
        }
    } else {
        console.log('📋 Test 2: Direct FCM Message Send');
        console.log('─'.repeat(50));
        console.log('  ⏭️  Skipped (no TEST_FCM_TOKEN provided)\n');
    }

    // Test 3: Multicast Message (if token provided)
    if (TEST_FCM_TOKEN) {
        console.log('📋 Test 3: Multicast Message');
        console.log('─'.repeat(50));

        try {
            const multicastMessage = {
                notification: {
                    title: '📢 Broadcast Test',
                    body: 'Testing multicast push notification'
                },
                tokens: [TEST_FCM_TOKEN] // Can add multiple tokens
            };

            console.log('  📤 Sending multicast message...');
            const response = await admin.messaging().sendMulticast(multicastMessage);

            console.log(`  ✅ Multicast sent`);
            console.log(`  ✅ Success count: ${response.successCount}`);
            console.log(`  ❌ Failure count: ${response.failureCount}`);

            if (response.failureCount > 0) {
                console.log('  ⚠️  Failures:');
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        console.log(`    - Token ${idx}: ${resp.error?.message}`);
                    }
                });
            }
            console.log();
            testsPassed++;
        } catch (error) {
            console.log(`  ❌ Multicast failed: ${error.message}\n`);
            testsFailed++;
        }
    } else {
        console.log('📋 Test 3: Multicast Message');
        console.log('─'.repeat(50));
        console.log('  ⏭️  Skipped (no TEST_FCM_TOKEN provided)\n');
    }

    // Test 4: Push Notification with Platform-Specific Options
    if (TEST_FCM_TOKEN) {
        console.log('📋 Test 4: Platform-Specific Push');
        console.log('─'.repeat(50));

        try {
            const advancedMessage = {
                notification: {
                    title: '⚙️ Advanced Test',
                    body: 'Push with platform-specific settings'
                },
                data: {
                    action: 'open_detail',
                    itemId: '12345'
                },
                android: {
                    priority: 'high',
                    notification: {
                        sound: 'default',
                        clickAction: 'OPEN_ACTIVITY',
                        color: '#667eea'
                    }
                },
                apns: {
                    headers: {
                        'apns-priority': '10'
                    },
                    payload: {
                        aps: {
                            sound: 'default',
                            badge: 1,
                            category: 'NEW_MESSAGE'
                        }
                    }
                },
                webpush: {
                    notification: {
                        icon: 'https://invexis.com/icon.png',
                        badge: 'https://invexis.com/badge.png',
                        vibrate: [200, 100, 200]
                    }
                },
                token: TEST_FCM_TOKEN
            };

            console.log('  📤 Sending platform-specific message...');
            const response = await admin.messaging().send(advancedMessage);

            console.log(`  ✅ Advanced message sent`);
            console.log(`  📨 Message ID: ${response}`);
            console.log(`  🤖 Android: High priority, custom color`);
            console.log(`  🍎 iOS: Sound, badge, category`);
            console.log(`  🌐 Web: Icon, badge, vibration\n`);
            testsPassed++;
        } catch (error) {
            console.log(`  ❌ Advanced send failed: ${error.message}\n`);
            testsFailed++;
        }
    } else {
        console.log('📋 Test 4: Platform-Specific Push');
        console.log('─'.repeat(50));
        console.log('  ⏭️  Skipped (no TEST_FCM_TOKEN provided)\n');
    }

    // Summary
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║                Test Summary                        ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    const totalTests = testsPassed + testsFailed;
    console.log(`  📝 Total tests:        ${totalTests}`);
    console.log(`  ✅ Passed:             ${testsPassed}`);
    console.log(`  ❌ Failed:             ${testsFailed}`);
    console.log(`  📊 Success rate:       ${totalTests > 0 ? ((testsPassed / totalTests) * 100).toFixed(0) : 0}%\n`);

    if (!TEST_FCM_TOKEN) {
        console.log('💡 To test actual message sending:');
        console.log('   1. Get an FCM token (see methods above)');
        console.log('   2. export TEST_FCM_TOKEN="your_token"');
        console.log('   3. Run this script again\n');
    }

    if (testsFailed === 0 && TEST_FCM_TOKEN) {
        console.log('🎉 All push notification tests passed!\n');
        console.log('✅ Your push notification system is working correctly.\n');
        process.exit(0);
    } else if (testsFailed === 0) {
        console.log('✅ Firebase is configured correctly.\n');
        console.log('⚠️  Add TEST_FCM_TOKEN to test actual delivery.\n');
        process.exit(0);
    } else {
        console.log('⚠️  Some tests failed. Review errors above.\n');
        process.exit(1);
    }
}

// Run tests
runTests().catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
});
