#!/usr/bin/env node
/**
 * Test Script: Sale Event
 * Publishes a sale.created event to verify notification dispatching
 */

const { publish, connect, exchanges } = require('/app/shared/rabbitmq');

async function testSaleEvent() {
    console.log('🧪 Testing sale.created event...\n');

    try {
        // Connect to RabbitMQ
        await connect();
        console.log('✅ Connected to RabbitMQ');

        // Create test sale event payload
        const saleEventPayload = {
            saleId: 9999,
            companyId: 'test-company-123',
            shopId: 'test-shop-456',
            customerId: 'test-customer-789',
            customerName: 'Test Customer',
            customerPhone: '+1234567890',
            customerEmail: 'test@example.com',
            soldBy: 'test-user-seller-123', // This is the recipient
            totalAmount: 150.00,
            status: 'initiated',
            paymentStatus: 'pending',
            items: [
                {
                    productId: 'product-001',
                    quantity: 2,
                    unitPrice: 50.00,
                    total: 100.00
                },
                {
                    productId: 'product-002',
                    quantity: 1,
                    unitPrice: 50.00,
                    total: 50.00
                }
            ],
            createdAt: new Date().toISOString(),
            traceId: `test-${Date.now()}`
        };

        // Wrap in event structure (matching sales-service pattern)
        const event = {
            id: `test-event-${Date.now()}`,
            source: 'test-script',
            type: 'sale.created',
            data: saleEventPayload,
            emittedAt: new Date().toISOString()
        };

        console.log('\n📤 Publishing sale.created event:');
        console.log(JSON.stringify(event, null, 2));

        // Publish to the same exchange and routing key as sales-service
        await publish(exchanges.topic, 'sale.created', event);

        console.log('\n✅ Event published successfully!');
        console.log('\n🔍 Expected behavior:');
        console.log('  1. Notification-service receives the event');
        console.log('  2. Extracts soldBy field as recipient:', saleEventPayload.soldBy);
        console.log('  3. Creates notification with channels: email, sms, push, in-app');
        console.log('  4. Dispatches to notification queue');
        console.log('\n📝 Check notification-service logs for processing confirmation');

        process.exit(0);
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run test
testSaleEvent();
