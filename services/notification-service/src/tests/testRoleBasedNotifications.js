/**
 * Manual Test for Role-Based Notification System
 * 
 * Run with: node src/tests/testRoleBasedNotifications.js
 */

const recipientResolver = require('../services/recipientResolver');
const intentClassifier = require('../services/intentClassifier');
const { AUTH_ROLES, NOTIFICATION_INTENTS } = require('../constants/roles');

console.log('🧪 Testing Role-Based Notification System\n');

// Test 1: Intent Classification
console.log('=== Test 1: Intent Classification ===');
const testEvents = [
    'shop.created',
    'company.suspended',
    'payment.failed',
    'inventory.out_of_stock',
    'debt.overdue'
];

testEvents.forEach(eventType => {
    const intent = intentClassifier.classify(eventType);
    const shouldNotify = intentClassifier.shouldNotify(eventType);
    console.log(`Event: ${eventType}`);
    console.log(`  Intent: ${intent}`);
    console.log(`  Should Notify: ${shouldNotify}`);
});

// Test 2: Channel Derivation
console.log('\n=== Test 2: Channel Derivation ===');
const testCases = [
    { intent: NOTIFICATION_INTENTS.OPERATIONAL, role: AUTH_ROLES.COMPANY_ADMIN },
    { intent: NOTIFICATION_INTENTS.FINANCIAL, role: AUTH_ROLES.COMPANY_ADMIN },
    { intent: NOTIFICATION_INTENTS.RISK_SECURITY, role: AUTH_ROLES.COMPANY_ADMIN },
    { intent: NOTIFICATION_INTENTS.OPERATIONAL, role: AUTH_ROLES.SHOP_MANAGER },
    { intent: NOTIFICATION_INTENTS.RISK_SECURITY, role: AUTH_ROLES.SUPER_ADMIN },
];

testCases.forEach(({ intent, role }) => {
    const channels = intentClassifier.getChannelsForIntent(intent, role);
    console.log(`${intent} + ${role}:`);
    console.log(`  Channels: ${channels.join(', ')}`);
});

// Test 3: Role Mapping
console.log('\n=== Test 3: Role Mapping ===');
const eventRoleMappings = [
    'shop.created',
    'company.suspended',
    'inventory.out_of_stock',
    'payment.failed',
    'debt.overdue'
];

eventRoleMappings.forEach(eventType => {
    const mapping = recipientResolver.getRoleMapping(eventType);
    console.log(`Event: ${eventType}`);
    console.log(`  Roles: ${mapping?.roles?.join(', ') || 'None'}`);
});

// Test 4: Recipient Resolution (requires auth-service running)
console.log('\n=== Test 4: Recipient Resolution (Mock) ===');
console.log('Note: This requires auth-service to be running');

async function testRecipientResolution() {
    try {
        // Mock event data
        const mockEvent = {
            companyId: 'company-123',
            shopId: 'shop-456',
            adminId: 'admin-789'
        };

        console.log('\nResolving recipients for shop.created...');
        const recipients = await recipientResolver.resolveByRole('shop.created', mockEvent);

        console.log('Recipients by role:');
        Object.entries(recipients).forEach(([role, userIds]) => {
            console.log(`  ${role}: ${userIds.length} user(s)`);
        });
    } catch (error) {
        console.log(`  Error: ${error.message}`);
        console.log('  (This is expected if auth-service is not running)');
    }
}

testRecipientResolution().then(() => {
    console.log('\n✅ Tests completed!');
}).catch(err => {
    console.error('\n❌ Test failed:', err);
});
