#!/usr/bin/env node

/**
 * Direct Email Test - Send a test email to a specific address
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const transporter = require('../src/config/email');

async function sendTestEmail() {
    const targetEmail = 'frankbahirwa@gmail.com';
    const startTime = Date.now();

    console.log('🚀 Starting direct email test...');
    console.log(`📧 Target Recipient: ${targetEmail}`);
    console.log(`🌐 SMTP Host: ${process.env.EMAIL_HOST}:${process.env.EMAIL_PORT}`);
    console.log(`👤 Sending as: ${process.env.EMAIL_USER}\n`);

    const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: targetEmail,
        subject: '🚀 Invexis Email Delivery Test',
        text: 'This is a direct test of the Invexis notification service email delivery. If you are reading this, the email system is working correctly! ✅',
        html: `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #2c3e50;">🚀 Invexis Email Delivery Test</h2>
                <p>This is a direct test of the <strong>Invexis notification service</strong> email delivery.</p>
                <p style="background: #f9f9f9; padding: 15px; border-left: 4px solid #4CAF50;">
                    If you are reading this, the email system is working correctly! ✅
                </p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                <small style="color: #7f8c8d;">Timestamp: ${new Date().toLocaleString()}</small>
            </div>
        `
    };

    try {
        console.log('📤 Sending email...');
        const info = await transporter.sendMail(mailOptions);
        const duration = Date.now() - startTime;

        console.log('\n✅ SUCCESS! Email sent successfully.');
        console.log(`📬 Message ID: ${info.messageId}`);
        console.log(`⏱️ Duration: ${duration}ms`);

        if (info.accepted && info.accepted.length > 0) {
            console.log(`✅ Accepted by: ${info.accepted.join(', ')}`);
        }

        process.exit(0);
    } catch (error) {
        console.error('\n❌ ERROR sending email:');
        console.error(`   Message: ${error.message}`);
        if (error.code) console.error(`   Code: ${error.code}`);
        if (error.command) console.error(`   Command: ${error.command}`);

        console.log('\n💡 Troubleshooting Tips:');
        console.log('   - Check if the App Password is still valid');
        console.log('   - Ensure port 587 is not blocked by your ISP/Firewall');
        console.log('   - Verify SMTP host and credentials in .env');

        process.exit(1);
    }
}

sendTestEmail();
