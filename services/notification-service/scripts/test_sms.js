#!/usr/bin/env node

// scripts/test_sms.js
// Comprehensive test script for SMS channel functionality

const mongoose = require('mongoose');
require('dotenv').config();

const Notification = require('../src/models/Notification');
const Template = require('../src/models/Template');
const { sendSMS } = require('../src/channels/sms');
const { compileTemplatesForChannels } = require('../src/services/templateService');
const logger = require('../src/utils/logger');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/invexis';

// Test phone number (replace with your actual test number)
const TEST_PHONE_NUMBER = process.env.TEST_PHONE_NUMBER || '+1234567890';

async function testSMSChannel() {
    try {
        // Connect to database
        await mongoose.connect(MONGO_URI);
        logger.info('✅ Connected to MongoDB');

        console.log('\n=== SMS Channel Test Suite ===\n');

        // Test 1: Check Twilio Configuration
        console.log('📋 Test 1: Verify Twilio Configuration');
        const twilioConfig = {
            sid: process.env.TWILIO_SID ? '✅ Set' : '❌ Missing',
            authToken: process.env.TWILIO_AUTH_TOKEN ? '✅ Set' : '❌ Missing',
            phoneNumber: process.env.TWILIO_PHONE_NUMBER || '❌ Missing'
        };
        console.log('Twilio SID:', twilioConfig.sid);
        console.log('Twilio Auth Token:', twilioConfig.authToken);
        console.log('Twilio Phone Number:', twilioConfig.phoneNumber);

        if (!process.env.TWILIO_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
            throw new Error('❌ Twilio configuration incomplete. Please set all required environment variables.');
        }
        console.log('✅ Twilio configuration complete\n');

        // Test 2: Check SMS Templates
        console.log('📋 Test 2: Verify SMS Templates');
        const smsTemplates = await Template.find({ type: 'sms', isActive: true });
        console.log(`Found ${smsTemplates.length} SMS templates:`);
        smsTemplates.forEach(template => {
            console.log(`  - ${template.name}: "${template.content.substring(0, 50)}..."`);
            console.log(`    Max Length: ${template.metadata?.smsConfig?.maxLength || 160}`);
            console.log(`    Allow Unicode: ${template.metadata?.smsConfig?.allowUnicode !== false}`);
        });
        console.log('✅ SMS templates loaded\n');

        // Test 3: Template Compilation
        console.log('📋 Test 3: Test Template Compilation');
        const testPayload = {
            userName: 'John Doe',
            companyName: 'Acme Corp',
            actionUrl: 'https://app.invexis.com/verify',
            supportEmail: 'support@invexis.com',
            orderId: 'ORD-12345',
            orderTotal: '$99.99',
            status: 'shipped'
        };

        const welcomeContent = await compileTemplatesForChannels('welcome', testPayload, { sms: true });
        if (welcomeContent.sms?.message) {
            console.log('✅ Welcome SMS compiled successfully:');
            console.log(`   Message: "${welcomeContent.sms.message}"`);
            console.log(`   Length: ${welcomeContent.sms.message.length} chars`);
        } else {
            console.log('⚠️  No welcome SMS template found');
        }

        const orderContent = await compileTemplatesForChannels('order_update', testPayload, { sms: true });
        if (orderContent.sms?.message) {
            console.log('✅ Order Update SMS compiled successfully:');
            console.log(`   Message: "${orderContent.sms.message}"`);
            console.log(`   Length: ${orderContent.sms.message.length} chars`);
        } else {
            console.log('⚠️  No order update SMS template found');
        }
        console.log();

        // Test 4: Create Test Notification
        console.log('📋 Test 4: Create Test Notification');
        const testNotification = await Notification.create({
            title: 'Test SMS',
            body: 'This is a test SMS notification',
            templateName: 'welcome',
            companyId: 'test-company-123',
            userId: new mongoose.Types.ObjectId(),
            scope: 'personal',
            channels: { sms: true, email: false, push: false, inApp: false },
            compiledContent: welcomeContent,
            payload: {
                ...testPayload,
                phone: TEST_PHONE_NUMBER
            }
        });
        console.log(`✅ Created test notification: ${testNotification._id}`);
        console.log(`   Channels enabled: ${JSON.stringify(testNotification.channels)}`);
        console.log(`   Has SMS content: ${testNotification.hasContentForChannel('sms')}`);
        console.log();

        // Test 5: Send SMS (with user confirmation)
        console.log('📋 Test 5: Send SMS');
        console.log(`⚠️  This will send an actual SMS to: ${TEST_PHONE_NUMBER}`);
        console.log('   Note: This test requires valid Twilio credentials and will use SMS credits.');
        console.log('   Skipping actual send for safety. To enable, set ENABLE_SMS_SEND=true\n');

        if (process.env.ENABLE_SMS_SEND === 'true') {
            console.log('🚀 Sending SMS...');
            const result = await sendSMS(
                testNotification,
                TEST_PHONE_NUMBER,
                testNotification.userId.toString(),
                testNotification.companyId
            );

            console.log('SMS Send Result:', JSON.stringify(result, null, 2));

            if (result.success) {
                console.log('✅ SMS sent successfully!');
                console.log(`   Log ID: ${result.logId}`);
            } else {
                console.log('❌ SMS send failed');
                if (result.rateLimited) console.log('   Reason: Rate limited');
                if (result.circuitBreakerOpen) console.log('   Reason: Circuit breaker open');
                if (result.error) console.log(`   Error: ${result.error}`);
            }
        } else {
            console.log('✅ SMS send test skipped (set ENABLE_SMS_SEND=true to enable)');
        }
        console.log();

        // Test 6: Test with Legacy Fields (no template)
        console.log('📋 Test 6: Test Legacy Fields (Fallback)');
        const legacyNotification = await Notification.create({
            title: 'Legacy Test',
            body: 'This is using legacy fields without template',
            templateName: 'none',
            companyId: 'test-company-123',
            userId: new mongoose.Types.ObjectId(),
            scope: 'personal',
            channels: { sms: true },
            payload: { phone: TEST_PHONE_NUMBER }
        });

        console.log(`✅ Created legacy notification: ${legacyNotification._id}`);
        console.log(`   Has SMS content: ${legacyNotification.hasContentForChannel('sms')}`);
        console.log('   This notification will use title + body as fallback');
        console.log(`   Expected message: "${legacyNotification.title}: ${legacyNotification.body}"`);
        console.log();

        // Test 7: Edge Cases
        console.log('📋 Test 7: Edge Cases');

        // Long message
        const longBody = 'A'.repeat(200);
        const longNotification = await Notification.create({
            title: 'Long Message Test',
            body: longBody,
            templateName: 'none',
            companyId: 'test-company-123',
            userId: new mongoose.Types.ObjectId(),
            scope: 'personal',
            channels: { sms: true },
            payload: { phone: TEST_PHONE_NUMBER }
        });
        console.log(`✅ Long message test notification: ${longNotification._id}`);
        console.log(`   Body length: ${longBody.length} chars (should be truncated to 160 in fallback mode)`);
        console.log();

        // Test 8: Template Validation
        console.log('📋 Test 8: Template Validation');
        const validation = await Template.validateTemplatesExist('welcome', { sms: true });
        console.log('Welcome template validation:', validation);

        const missingValidation = await Template.validateTemplatesExist('nonexistent_template', { sms: true });
        console.log('Missing template validation:', missingValidation);
        console.log();

        console.log('=== ✅ All SMS Tests Completed ===\n');
        console.log('Summary:');
        console.log(`- Total test notifications created: 3`);
        console.log(`- SMS templates available: ${smsTemplates.length}`);
        console.log(`- Twilio configuration: Complete`);
        console.log(`- Actual SMS sent: ${process.env.ENABLE_SMS_SEND === 'true' ? 'Yes' : 'No (skipped)'}`);
        console.log('\nTo send actual SMS for testing:');
        console.log('1. Set TEST_PHONE_NUMBER=+1234567890 (your phone number)');
        console.log('2. Set ENABLE_SMS_SEND=true');
        console.log('3. Run: node scripts/test_sms.js\n');

    } catch (error) {
        console.error('❌ SMS Test failed:', error);
        logger.error('SMS test error:', error);
    } finally {
        await mongoose.disconnect();
        logger.info('Disconnected from MongoDB');
        process.exit(0);
    }
}

// Run the test
testSMSChannel();
