#!/usr/bin/env node

/**
 * Direct SMS Test - Send a test SMS to a specific number
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const client = require('../src/config/sms');

async function sendTestSms() {
    const targetPhone = '+250798725288';
    const startTime = Date.now();

    console.log('🚀 Starting direct SMS test...');
    console.log(`📱 Target Phone: ${targetPhone}`);
    console.log(`👤 Sending via Twilio: ${process.env.TWILIO_PHONE_NUMBER}\n`);

    const messageOptions = {
        body: `🚀 Invexis SMS Delivery Test\n\nThis is a direct test of the Invexis notification service SMS delivery. If you are reading this, the SMS system is working correctly! ✅\n\nTimestamp: ${new Date().toLocaleString()}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: targetPhone,
    };

    try {
        console.log('📤 Sending SMS via Twilio...');
        const message = await client.messages.create(messageOptions);
        const duration = Date.now() - startTime;

        console.log('\n✅ SUCCESS! SMS sent successfully.');
        console.log(`📬 Message SID: ${message.sid}`);
        console.log(`⏱️ Duration: ${duration}ms`);
        console.log(`📊 Status: ${message.status}`);

        process.exit(0);
    } catch (error) {
        console.error('\n❌ ERROR sending SMS:');
        console.error(`   Message: ${error.message}`);
        if (error.code) console.error(`   Code: ${error.code}`);
        if (error.status) console.error(`   Status: ${error.status}`);

        console.log('\n💡 Troubleshooting Tips:');
        console.log('   - Verify Twilio Account SID and Auth Token');
        console.log('   - Ensure the "from" number is a valid Twilio long-code or short-code');
        console.log('   - Check if the target number is in a supported region');
        console.log('   - If using a trial account, verify the number first');

        process.exit(1);
    }
}

sendTestSms();
