#!/usr/bin/env node
/**
 * Test Script: Debt Events
 * Publishes various debt events to verify dispatcher integration
 */

const { publish, connect, exchanges } = require('/app/shared/rabbitmq');

async function testDebtEvents() {
    console.log('🧪 Testing debt events...\n');

    try {
        // Connect to RabbitMQ
        await connect();
        console.log('✅ Connected to RabbitMQ');

        // Test 1: Debt Created
        console.log('\n💰 Test 1: debt.created');
        console.log('─'.repeat(50));

        const debtCreatedPayload = {
            debtId: `test-debt-${Date.now()}`,
            companyId: 'test-company-123',
            shopId: 'test-shop-456',
            customerId: 'test-customer-789',
            totalAmount: 500.00,
            balance: 500.00,
            status: 'UNPAID',
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        };

        // Debt service publishes raw payloads (normalized by consumer)
        await publish(exchanges.topic, 'debt.created', debtCreatedPayload);
        console.log(JSON.stringify(debtCreatedPayload, null, 2));
        console.log('✅ debt.created event published');

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Test 2: Debt Repayment Created
        console.log('\n💰 Test 2: debt.repayment.created');
        console.log('─'.repeat(50));

        const repaymentPayload = {
            debtId: debtCreatedPayload.debtId,
            repaymentId: `test-repayment-${Date.now()}`,
            companyId: 'test-company-123',
            shopId: 'test-shop-456',
            customerId: 'test-customer-789',
            amountPaid: 200.00,
            paymentMethod: 'CASH'
        };

        await publish(exchanges.topic, 'debt.repayment.created', repaymentPayload);
        console.log(JSON.stringify(repaymentPayload, null, 2));
        console.log('✅ debt.repayment.created event published');

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Test 3: Debt Reminder (Dynamic routing key)
        console.log('\n💰 Test 3: debt.reminder.upcoming.7');
        console.log('─'.repeat(50));

        const reminderPayload = {
            debtId: debtCreatedPayload.debtId,
            companyId: 'test-company-123',
            shopId: 'test-shop-456',
            customerId: 'test-customer-789',
            daysUntilDue: 7,
            totalAmount: 500.00,
            balance: 300.00,
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        };

        await publish(exchanges.topic, 'debt.reminder.upcoming.7', reminderPayload);
        console.log(JSON.stringify(reminderPayload, null, 2));
        console.log('✅ debt.reminder.upcoming.7 event published');

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Test 4: Debt Overdue
        console.log('\n💰 Test 4: debt.overdue');
        console.log('─'.repeat(50));

        const overduePayload = {
            debtId: debtCreatedPayload.debtId,
            companyId: 'test-company-123',
            shopId: 'test-shop-456',
            customerId: 'test-customer-789',
            overdueDays: 5,
            totalAmount: 500.00,
            balance: 300.00,
            dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
        };

        await publish(exchanges.topic, 'debt.overdue', overduePayload);
        console.log(JSON.stringify(overduePayload, null, 2));
        console.log('✅ debt.overdue event published');

        console.log('\n✅ All debt events published successfully!');
        console.log('\n🔍 Expected behavior:');
        console.log('  1. Notification-service receives all events');
        console.log('  2. Normalizes raw payloads to {type, data}');
        console.log('  3. Routes to debtEvent.handler');
        console.log('  4. Handler uses dispatchBroadcastEvent (NOT direct Notification.create)');
        console.log('  5. Applies channel mapping from eventChannelMapping.js');
        console.log('     - debt.created: in-app, push (normal priority)');
        console.log('     - debt.repayment.created: in-app, push (normal priority)');
        console.log('     - debt.reminder.upcoming: email, push, in-app (medium priority)');
        console.log('     - debt.overdue: email, sms, push, in-app (urgent priority)');
        console.log('\n📝 Check notification-service logs for dispatcher usage');

        process.exit(0);
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run test
testDebtEvents();
