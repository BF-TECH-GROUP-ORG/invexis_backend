#!/usr/bin/env node

// scripts/test_sms_simple.js
// Test script for the new simplified SMS system

const mongoose = require('mongoose');
require('dotenv').config();

const Notification = require('../src/models/Notification');
const { sendSMS } = require('../src/channels/sms');
const { getSmsMessage, hasTemplate, getAvailableTemplates } = require('../src/config/smsTemplates');
const logger = require('../src/utils/logger');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/invexis';

// Test phone number (replace with your actual test number)
const TEST_PHONE_NUMBER = process.env.TEST_PHONE_NUMBER || '+1234567890';

async function testSimplifiedSMS() {
    try {
        // Connect to database
        await mongoose.connect(MONGO_URI);
        logger.info('✅ Connected to MongoDB');

        console.log('\n╔════════════════════════════════════════════════════╗');
        console.log('║   Simplified SMS Channel Test Suite               ║');
        console.log('╚════════════════════════════════════════════════════╝\n');

        // Test 1: Check Twilio Configuration
        console.log('📋 Test 1: Verify Twilio Configuration');
        console.log('─'.repeat(50));
        const twilioConfig = {
            sid: process.env.TWILIO_SID ? '✅ Configured' : '❌ Missing',
            authToken: process.env.TWILIO_AUTH_TOKEN ? '✅ Configured' : '❌ Missing',
            phoneNumber: process.env.TWILIO_PHONE_NUMBER || '❌ Missing'
        };
        console.log(`  Twilio SID:         ${twilioConfig.sid}`);
        console.log(`  Twilio Auth Token:  ${twilioConfig.authToken}`);
        console.log(`  Twilio Phone:       ${twilioConfig.phoneNumber}`);

        if (!process.env.TWILIO_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
            throw new Error('❌ Twilio configuration incomplete');
        }
        console.log('✅ Twilio configuration complete\n');

        // Test 2: List Available Templates
        console.log('📋 Test 2: Available SMS Templates');
        console.log('─'.repeat(50));
        const templates = getAvailableTemplates();
        console.log(`Found ${templates.length} SMS templates:\n`);
        templates.forEach((name, index) => {
            console.log(`  ${index + 1}. ${name}`);
        });
        console.log();

        // Test 3: Template Message Generation
        console.log('📋 Test 3: Template Message Generation');
        console.log('─'.repeat(50));

        const testPayloads = {
            welcome: {
                userName: 'John Doe',
                companyName: 'Acme Corp',
                actionUrl: 'https://app.invexis.com/verify',
                supportEmail: 'support@invexis.com'
            },
            order_update: {
                orderId: 'ORD-12345',
                status: 'shipped',
                orderTotal: '$99.99',
                actionUrl: 'https://app.invexis.com/orders/12345'
            },
            sale_created: {
                saleId: 'SALE-789',
                amount: '$150.00',
                companyName: 'Acme Corp'
            },
            low_stock_alert: {
                productName: 'Widget Pro',
                currentStock: 5,
                threshold: 10
            },
            payment_received: {
                amount: '$250.00',
                invoiceId: 'INV-456',
                customerName: 'Jane Smith'
            }
        };

        for (const [templateName, payload] of Object.entries(testPayloads)) {
            if (hasTemplate(templateName)) {
                const message = getSmsMessage(templateName, payload);
                console.log(`\n  ✅ ${templateName}:`);
                console.log(`     Message: "${message}"`);
                console.log(`     Length: ${message.length} chars`);

                if (message.length > 160) {
                    console.log(`     ⚠️  Warning: Exceeds 160 chars, will be truncated`);
                }
            }
        }
        console.log();

        // Test 4: Template Validation
        console.log('📋 Test 4: Template Validation');
        console.log('─'.repeat(50));
        console.log(`  hasTemplate('welcome'): ${hasTemplate('welcome')}`);
        console.log(`  hasTemplate('nonexistent'): ${hasTemplate('nonexistent')}`);
        console.log(`  hasTemplate('default'): ${hasTemplate('default')}`);
        console.log();

        // Test 5: Create Test Notifications
        console.log('📋 Test 5: Create Test Notifications');
        console.log('─'.repeat(50));

        const testNotifications = [];

        // Notification with template
        const welcomeNotification = await Notification.create({
            title: 'Welcome',
            body: 'Welcome to our platform',
            templateName: 'welcome',
            companyId: 'test-company-123',
            userId: new mongoose.Types.ObjectId(),
            scope: 'personal',
            channels: { sms: true, email: false, push: false, inApp: false },
            payload: {
                ...testPayloads.welcome,
                phone: TEST_PHONE_NUMBER
            }
        });
        testNotifications.push(welcomeNotification);
        console.log(`  ✅ Created welcome notification: ${welcomeNotification._id}`);

        // Notification with different template
        const orderNotification = await Notification.create({
            title: 'Order Update',
            body: 'Your order has been updated',
            templateName: 'order_update',
            companyId: 'test-company-123',
            userId: new mongoose.Types.ObjectId(),
            scope: 'personal',
            channels: { sms: true },
            payload: {
                ...testPayloads.order_update,
                phone: TEST_PHONE_NUMBER
            }
        });
        testNotifications.push(orderNotification);
        console.log(`  ✅ Created order update notification: ${orderNotification._id}`);

        // Legacy notification (no template)
        const legacyNotification = await Notification.create({
            title: 'Legacy Alert',
            body: 'This uses legacy title and body fields',
            templateName: 'nonexistent',
            companyId: 'test-company-123',
            userId: new mongoose.Types.ObjectId(),
            scope: 'personal',
            channels: { sms: true },
            payload: { phone: TEST_PHONE_NUMBER }
        });
        testNotifications.push(legacyNotification);
        console.log(`  ✅ Created legacy notification: ${legacyNotification._id}`);
        console.log();

        // Test 6: SMS Sending (Optional)
        if (process.env.ENABLE_SMS_SEND === 'true') {
            console.log('📋 Test 6: Send Actual SMS Messages');
            console.log('─'.repeat(50));
            console.log(`  🚀 Sending SMS to: ${TEST_PHONE_NUMBER}\n`);

            for (const notification of testNotifications) {
                console.log(`  Sending notification: ${notification.templateName}`);
                const result = await sendSMS(
                    notification,
                    TEST_PHONE_NUMBER,
                    notification.userId.toString(),
                    notification.companyId
                );

                if (result.success) {
                    console.log(`    ✅ SUCCESS`);
                    console.log(`       Message ID: ${result.messageId}`);
                    console.log(`       Log ID: ${result.logId}`);
                    console.log(`       Length: ${result.messageLength} chars\n`);
                } else {
                    console.log(`    ❌ FAILED`);
                    if (result.rateLimited) console.log(`       Reason: Rate limited`);
                    if (result.circuitBreakerOpen) console.log(`       Reason: Circuit breaker open`);
                    if (result.error) console.log(`       Error: ${result.error}\n`);
                }

                // Wait between sends to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } else {
            console.log('📋 Test 6: Send Actual SMS Messages');
            console.log('─'.repeat(50));
            console.log('  ⏭️  SKIPPED (set ENABLE_SMS_SEND=true to enable)');
            console.log(`  📱 Would send to: ${TEST_PHONE_NUMBER}\n`);
        }

        // Test 7: Edge Cases
        console.log('📋 Test 7: Edge Cases');
        console.log('─'.repeat(50));

        // Long message test
        const longPayload = {
            title: 'Very Long Title',
            body: 'A'.repeat(200)
        };
        const longMessage = getSmsMessage('default', longPayload, { maxLength: 160, truncate: true });
        console.log(`  Long message truncation:`);
        console.log(`    Original length: 200+ chars`);
        console.log(`    Truncated length: ${longMessage.length} chars`);
        console.log(`    Ends with '...': ${longMessage.endsWith('...')}`);

        // Empty payload test
        const emptyMessage = getSmsMessage('default', {});
        console.log(`\n  Empty payload fallback:`);
        console.log(`    Message: "${emptyMessage}"`);

        // Missing fields test
        const partialPayload = { userName: 'John' };
        const partialMessage = getSmsMessage('welcome', partialPayload);
        console.log(`\n  Missing fields handling:`);
        console.log(`    Message: "${partialMessage}"`);
        console.log(`    Contains 'undefined': ${partialMessage.includes('undefined')}`);
        console.log();

        // Summary
        console.log('\n╔════════════════════════════════════════════════════╗');
        console.log('║              Test Summary                          ║');
        console.log('╚════════════════════════════════════════════════════╝\n');
        console.log(`  ✅ Twilio Configuration:      Complete`);
        console.log(`  📝 Available Templates:       ${templates.length}`);
        console.log(`  🔨 Test Notifications:        ${testNotifications.length} created`);
        console.log(`  📤 SMS Sent:                  ${process.env.ENABLE_SMS_SEND === 'true' ? 'Yes' : 'No (skipped)'}`);
        console.log(`  💡 Template System:           Simplified (No Handlebars)`);
        console.log();

        if (process.env.ENABLE_SMS_SEND !== 'true') {
            console.log('📱 To test actual SMS sending:');
            console.log('   1. export TEST_PHONE_NUMBER="+1234567890"');
            console.log('   2. export ENABLE_SMS_SEND=true');
            console.log('   3. node scripts/test_sms_simple.js\n');
        }

        console.log('✅ All tests completed successfully!\n');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        logger.error('SMS test error:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        logger.info('Disconnected from MongoDB');
        process.exit(0);
    }
}

// Run the test
testSMSChannel();
