#!/usr/bin/env node

// scripts/test_sms_templates.js
// Test SMS templates without database or external dependencies

const { getSmsMessage, hasTemplate, getAvailableTemplates } = require('../src/config/smsTemplates');

console.log('\n╔════════════════════════════════════════════════════╗');
console.log('║     SMS Template System Test (Standalone)         ║');
console.log('╚════════════════════════════════════════════════════╝\n');

// GET /auth/auth/users?role=worker&shops=39cf5aad-6a0f-4be8-90ba-675930d4b927&assignedDepartments=management 404 1.287 ms - 40


// Test 1: List Available Templates
console.log('📋 Test 1: Available SMS Templates');
console.log('─'.repeat(50));
const templates = getAvailableTemplates();
console.log(`Found ${templates.length} SMS templates:\n`);
templates.forEach((name, index) => {
    console.log(`  ${index + 1}. ${name}`);
});
console.log();

// Test 2: Template Message Generation
console.log('📋 Test 2: Template Message Generation');
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
    out_of_stock: {
        productName: 'Premium Widget',
        productId: 'PROD-456'
    },
    payment_received: {
        amount: '$250.00',
        invoiceId: 'INV-456',
        customerName: 'Jane Smith'
    },
    payment_reminder: {
        amount: '$500.00',
        invoiceId: 'INV-789',
        dueDate: '2025-11-30'
    },
    debt_status_updated: {
        debtId: 'DEBT-123',
        status: 'partially paid',
        amount: '$1,200.00'
    },
    appointment_reminder: {
        appointmentTime: '2:00 PM tomorrow',
        location: '123 Main St',
        customerName: 'Bob Johnson'
    },
    password_reset: {
        resetCode: 'ABC123XYZ',
        userName: 'Alice'
    },
    two_factor_code: {
        code: '789456'
    },
    account_verification: {
        verificationCode: '123456',
        companyName: 'Acme Corp'
    }
};

let successCount = 0;
let failCount = 0;

for (const [templateName, payload] of Object.entries(testPayloads)) {
    if (hasTemplate(templateName)) {
        try {
            const message = getSmsMessage(templateName, payload);
            console.log(`\n  ✅ ${templateName}:`);
            console.log(`     "${message}"`);
            console.log(`     Length: ${message.length} chars ${message.length > 160 ? '⚠️  (>160)' : '✓'}`);
            successCount++;
        } catch (error) {
            console.log(`\n  ❌ ${templateName}: ERROR - ${error.message}`);
            failCount++;
        }
    }
}
console.log();

// Test 3: Template Validation
console.log('📋 Test 3: Template Validation');
console.log('─'.repeat(50));
console.log(`  hasTemplate('welcome'):       ${hasTemplate('welcome') ? '✅ true' : '❌ false'}`);
console.log(`  hasTemplate('nonexistent'):   ${hasTemplate('nonexistent') ? '❌ true' : '✅ false'}`);
console.log(`  hasTemplate('default'):       ${hasTemplate('default') ? '✅ true' : '❌ false'}`);
console.log();

// Test 4: Edge Cases
console.log('📋 Test 4: Edge Cases');
console.log('─'.repeat(50));

// Long message test
const longPayload = {
    title: 'Very Long Title',
    body: 'A'.repeat(200)
};
const longMessage = getSmsMessage('default', longPayload, { maxLength: 160, truncate: true });
console.log(`  Long message truncation:`);
console.log(`    Original: 200+ chars`);
console.log(`    Result: ${longMessage.length} chars`);
console.log(`    Truncated: ${longMessage.endsWith('...') ? '✅' : '❌'}`);

// Empty payload test
const emptyMessage = getSmsMessage('default', {});
console.log(`\n  Empty payload:`);
console.log(`    Message: "${emptyMessage}"`);
console.log(`    Non-empty: ${emptyMessage.length > 0 ? '✅' : '❌'}`);

// Missing fields test
const partialPayload = { userName: 'John' };
const partialMessage = getSmsMessage('welcome', partialPayload);
console.log(`\n  Missing fields:`);
console.log(`    Message: "${partialMessage}"`);
console.log(`    Has 'undefined': ${partialMessage.includes('undefined') ? '❌' : '✅'}`);

// Non-existent template fallback
const fallbackMessage = getSmsMessage('nonexistent_template', { title: 'Test', body: 'Message' });
console.log(`\n  Nonexistent template:`);
console.log(`    Falls back to default: ${fallbackMessage.includes('Test') ? '✅' : '❌'}`);
console.log(`    Message: "${fallbackMessage}"`);

// Custom max length
const customLengthMessage = getSmsMessage('welcome', testPayloads.welcome, { maxLength: 50, truncate: true });
console.log(`\n  Custom max length (50):`);
console.log(`    Message length: ${customLengthMessage.length}`);
console.log(`    Within limit: ${customLengthMessage.length <= 50 ? '✅' : '❌'}`);
console.log();

// Test 5: Character Count Analysis
console.log('📋 Test 5: Character Count Analysis');
console.log('─'.repeat(50));
const lengths = Object.entries(testPayloads).map(([name, payload]) => {
    if (hasTemplate(name)) {
        const msg = getSmsMessage(name, payload);
        return { name, length: msg.length };
    }
    return null;
}).filter(Boolean);

const avgLength = lengths.reduce((sum, item) => sum + item.length, 0) / lengths.length;
const maxItem = lengths.reduce((max, item) => item.length > max.length ? item : max);
const minItem = lengths.reduce((min, item) => item.length < min.length ? item : min);
const over160 = lengths.filter(item => item.length > 160).length;

console.log(`  Average length:        ${avgLength.toFixed(1)} chars`);
console.log(`  Shortest template:     ${minItem.name} (${minItem.length} chars)`);
console.log(`  Longest template:      ${maxItem.name} (${maxItem.length} chars)`);
console.log(`  Templates > 160 chars: ${over160} ${over160 > 0 ? '⚠️' : '✅'}`);
console.log();

// Summary
console.log('\n╔════════════════════════════════════════════════════╗');
console.log('║                Test Summary                        ║');
console.log('╚════════════════════════════════════════════════════╝\n');
console.log(`  📝 Total Templates:        ${templates.length}`);
console.log(`  ✅ Successful Tests:       ${successCount}`);
console.log(`  ❌ Failed Tests:           ${failCount}`);
console.log(`  📊 Average Length:         ${avgLength.toFixed(1)} chars`);
console.log(`  ⚠️  Templates > 160:       ${over160}`);
console.log(`  💡 System Type:            Function-based (No Handlebars)`);
console.log();

if (failCount === 0 && over160 === 0) {
    console.log('🎉 All tests passed! SMS template system is working perfectly.\n');
    process.exit(0);
} else {
    if (failCount > 0) {
        console.log(`⚠️  ${failCount} template(s) failed. Please review errors above.\n`);
    }
    if (over160 > 0) {
        console.log(`⚠️  ${over160} template(s) exceed 160 characters. They will be truncated when sent.\n`);
    }
    process.exit(failCount > 0 ? 1 : 0);
}
