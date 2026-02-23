#!/usr/bin/env node
/**
 * Test Script: Sales Notifications
 * Publishes sale.created and sale.refund.processed events
 * to verify notification dispatching.
 */

const { publish, connect, exchanges } = require('/app/shared/rabbitmq');

async function testSalesNotifications() {
    console.log('🧪 Testing sales notifications...\n');

    try {
        // Connect to RabbitMQ
        await connect();
        console.log('✅ Connected to RabbitMQ');

        // Test 1: Sale Created Event
        console.log('\n💰 Test 1: sale.created');
        console.log('─'.repeat(50));

        const saleCreatedEvent = {
            id: `test-sale-created-${Date.now()}`,
            source: 'test-script',
            type: 'sale.created',
            data: {
                saleId: 'SALE-CONF-999',
                companyId: '46e5d562-34f2-4892-a83a-c9cf55b60006',
                companyName: 'Invexis Ltd',
                shopId: '39cf5aad-6a0f-4be8-90ba-675930d4b927',
                shopName: 'Main Store - Kigali',
                customerId: 'customer-789',
                customerName: 'Jean Valjean',
                customerPhone: '+250780000000',
                customerEmail: 'jean@example.com',
                performedByName: 'John Clerk (Staff)',
                totalAmount: 15000,
                items: [
                    { productName: 'Sugar 1kg', quantity: 2, total: 5000 },
                    { productName: 'Milk 1L', quantity: 5, total: 10000 }
                ],
                createdAt: new Date().toISOString()
            },
            emittedAt: new Date().toISOString()
        };

        console.log(JSON.stringify(saleCreatedEvent, null, 2));
        await publish(exchanges.topic, 'sale.created', saleCreatedEvent);
        console.log('✅ sale.created event published');

        // Wait a bit before next test
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Test 2: Sale Refund Processed Event
        console.log('\n💰 Test 2: sale.refund.processed');
        console.log('─'.repeat(50));

        const refundEvent = {
            id: `test-refund-${Date.now()}`,
            source: 'test-script',
            type: 'sale.refund.processed',
            data: {
                saleId: 'SALE-CONF-999',
                companyId: '46e5d562-34f2-4892-a83a-c9cf55b60006',
                companyName: 'Invexis Ltd',
                shopId: '39cf5aad-6a0f-4be8-90ba-675930d4b927',
                shopName: 'Main Store - Kigali',
                refundAmount: 5000,
                customerName: 'Jean Valjean',
                customerPhone: '+250780000000',
                performedByName: 'Alice Manager',
                processedAt: new Date().toISOString()
            },
            emittedAt: new Date().toISOString()
        };

        console.log(JSON.stringify(refundEvent, null, 2));
        await publish(exchanges.topic, 'sale.refund.processed', refundEvent);
        console.log('✅ sale.refund.processed event published');

        console.log('\n✅ All sales events published successfully!');
        console.log('\n🔍 Expected behavior:');
        console.log('  1. Notification-service receives events');
        console.log('  2. Routes to saleEvent.handler');
        console.log('  3. Applies channel mapping');
        console.log('     - sale.created: sms, push, in-app, email');
        console.log('     - sale.refund.processed: email, sms, in-app');
        console.log('\n📝 Check notification-service logs for processing confirmation');

        console.log('\n📝 Sleeping 3s to ensure flush...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run test
testSalesNotifications();
