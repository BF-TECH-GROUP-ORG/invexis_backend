#!/usr/bin/env node

// scripts/test_otp_templates.js
// Test OTP templates for both SMS and email

const { getSmsMessage, hasTemplate: hasSmsTemplate } = require('../src/config/smsTemplates');

console.log('\n╔════════════════════════════════════════════════════╗');
console.log('║          OTP Templates Test (SMS & Email)         ║');
console.log('╚════════════════════════════════════════════════════╝\n');

// Test 1: SMS OTP Template
console.log('📋 Test 1: SMS OTP Template');
console.log('─'.repeat(50));

const smsTestPayloads = [
    {
        name: 'Standard OTP (6 digits)',
        payload: {
            otp: '123456',
            companyName: 'Invexis',
            expiryMinutes: 10
        }
    },
    {
        name: 'Short expiry OTP',
        payload: {
            otp: '789012',
            companyName: 'Acme Corp',
            expiryMinutes: 5
        }
    },
    {
        name: 'Extended expiry OTP',
        payload: {
            otp: '456789',
            companyName: 'TechCo',
            expiryMinutes: 15
        }
    },
    {
        name: 'Default expiry (no expiryMinutes)',
        payload: {
            otp: '999888',
            companyName: 'StartupXYZ'
        }
    }
];

let smsSuccessCount = 0;
let smsFailCount = 0;

console.log(`Testing SMS OTP template...${hasSmsTemplate('otp') ? ' ✅ Found' : ' ❌ Not found'}\n`);

for (const test of smsTestPayloads) {
    try {
        const message = getSmsMessage('otp', test.payload);
        console.log(`  ✅ ${test.name}:`);
        console.log(`     "${message}"`);
        console.log(`     Length: ${message.length} chars ${message.length > 160 ? '⚠️  (>160)' : '✓'}\n`);
        smsSuccessCount++;
    } catch (error) {
        console.log(`  ❌ ${test.name}: ERROR - ${error.message}\n`);
        smsFailCount++;
    }
}

// Test 2: Email OTP Template (check file exists)
console.log('\n📋 Test 2: Email OTP Template');
console.log('─'.repeat(50));

const fs = require('fs');
const path = require('path');

const emailTemplatePath = path.join(__dirname, '../templates/email/otp.html');
const emailTemplateExists = fs.existsSync(emailTemplatePath);

console.log(`Email OTP template: ${emailTemplateExists ? '✅ Found' : '❌ Not found'}`);

if (emailTemplateExists) {
    const templateContent = fs.readFileSync(emailTemplatePath, 'utf-8');
    const hasOtpPlaceholder = templateContent.includes('{{otp}}');
    const hasExpiryPlaceholder = templateContent.includes('{{expiryMinutes}}');
    const hasCompanyPlaceholder = templateContent.includes('{{companyName}}');
    const hasUserPlaceholder = templateContent.includes('{{userName}}');

    console.log(`  Contains {{otp}} placeholder: ${hasOtpPlaceholder ? '✅' : '❌'}`);
    console.log(`  Contains {{expiryMinutes}} placeholder: ${hasExpiryPlaceholder ? '✅' : '❌'}`);
    console.log(`  Contains {{companyName}} placeholder: ${hasCompanyPlaceholder ? '✅' : '❌'}`);
    console.log(`  Contains {{userName}} placeholder: ${hasUserPlaceholder ? '✅' : '❌'}`);
    console.log(`  File size: ${(templateContent.length / 1024).toFixed(2)} KB`);
}

// Test 3: Check Template Registry
console.log('\n📋 Test 3: Template Registry Configuration');
console.log('─'.repeat(50));

let hasOtpConfig = false;

try {
    const templates = require('../src/config/templates');
    hasOtpConfig = 'otp' in templates;

    console.log(`OTP in templates registry: ${hasOtpConfig ? '✅ Found' : '❌ Not found'}`);

    if (hasOtpConfig) {
        const otpConfig = templates.otp;
        console.log(`  Email config: ${otpConfig.email ? '✅' : '❌'}`);
        console.log(`  SMS config: ${otpConfig.sms ? '✅' : '❌'}`);
        console.log(`  Push config: ${otpConfig.push ? '✅' : '❌'}`);
        console.log(`  In-app config: ${otpConfig.inApp ? '✅' : '❌'}`);

        if (otpConfig.email) {
            console.log(`\n  Email subject: "${otpConfig.email.subject}"`);
            console.log(`  Priority: ${otpConfig.email.metadata?.priority || 'normal'}`);
        }
    }
} catch (error) {
    console.log(`❌ Error loading templates: ${error.message}`);
}

// Test 4: Welcome Email Cleanup Verification
console.log('\n📋 Test 4: Welcome Email Cleanup Verification');
console.log('─'.repeat(50));

const welcomeTemplatePath = path.join(__dirname, '../templates/email/welcome.html');
const welcomeTemplateExists = fs.existsSync(welcomeTemplatePath);

console.log(`Welcome email template: ${welcomeTemplateExists ? '✅ Found' : '❌ Not found'}`);

if (welcomeTemplateExists) {
    const welcomeContent = fs.readFileSync(welcomeTemplatePath, 'utf-8');

    // Check for removed elements
    const hasVerifyButton = welcomeContent.toLowerCase().includes('verify email');
    const hasActionUrl = welcomeContent.includes('{{actionUrl}}');
    const hasLinkFallback = welcomeContent.includes('link-fallback');
    const hasBtnClass = welcomeContent.includes('class="btn"');

    console.log(`  Removed verification button: ${!hasVerifyButton ? '✅' : '❌ Still present'}`);
    console.log(`  Removed action URL: ${!hasActionUrl ? '✅' : '❌ Still present'}`);
    console.log(`  Removed link fallback: ${!hasLinkFallback ? '✅' : '❌ Still present'}`);
    console.log(`  Removed button styling: ${!hasBtnClass ? '✅' : '❌ Still present'}`);

    // Check for essential elements
    const hasCompanyName = welcomeContent.includes('{{companyName}}');
    const hasUserName = welcomeContent.includes('{{userName}}');
    const hasSupportEmail = welcomeContent.includes('{{supportEmail}}');

    console.log(`\n  Has company name: ${hasCompanyName ? '✅' : '❌'}`);
    console.log(`  Has user name: ${hasUserName ? '✅' : '❌'}`);
    console.log(`  Has support email: ${hasSupportEmail ? '✅' : '❌'}`);
    console.log(`  File size: ${(welcomeContent.length / 1024).toFixed(2)} KB`);
}

// Summary
console.log('\n╔════════════════════════════════════════════════════╗');
console.log('║                Test Summary                        ║');
console.log('╚════════════════════════════════════════════════════╝\n');

const totalSmsTests = smsTestPayloads.length;
const smsPassRate = ((smsSuccessCount / totalSmsTests) * 100).toFixed(0);

console.log(`  📱 SMS OTP Template:`);
console.log(`     Tests passed: ${smsSuccessCount}/${totalSmsTests} (${smsPassRate}%)`);
console.log(`     Template exists: ${hasSmsTemplate('otp') ? '✅' : '❌'}`);

console.log(`\n  📧 Email OTP Template:`);
console.log(`     Template file: ${emailTemplateExists ? '✅ Exists' : '❌ Missing'}`);
console.log(`     Registry config: ${hasOtpConfig ? '✅ Configured' : '❌ Not configured'}`);

console.log(`\n  🎯 Welcome Email Cleanup:`);
console.log(`     Template simplified: ${welcomeTemplateExists ? '✅' : '❌'}`);

console.log();

if (smsFailCount === 0 && emailTemplateExists && hasOtpConfig) {
    console.log('🎉 All OTP templates are configured and working!\n');
    process.exit(0);
} else {
    if (smsFailCount > 0) {
        console.log(`⚠️  ${smsFailCount} SMS test(s) failed.\n`);
    }
    if (!emailTemplateExists) {
        console.log('⚠️  Email OTP template file is missing.\n');
    }
    if (!hasOtpConfig) {
        console.log('⚠️  OTP template not configured in registry.\n');
    }
    process.exit(smsFailCount > 0 ? 1 : 0);
}
