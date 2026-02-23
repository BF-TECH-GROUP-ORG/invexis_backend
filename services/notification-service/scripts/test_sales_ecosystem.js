#!/usr/bin/env node
/**
 * Test Script: Sales Ecosystem Notifications
 * Publishes sale.created and sale.refund.processed events to verify
 * multi-role notification dispatching.
 */

const path = require('path');
// Use relative path for local execution, or absolute for container
const rabbitmqPath = process.env.CONTAINER_ENV ? '/app/shared/rabbitmq' : path.join(__dirname, '../../../shared/rabbitmq');

// Set local RabbitMQ URL if not defined
if (!process.env.RABBITMQ_URL) {
    process.env.RABBITMQ_URL = 'amqp://invexis:invexispass@localhost:5673';
}

const { publish, connect, exchanges } = require(rabbitmqPath);

async function testSalesEcosystem() {
    console.log('🧪 Testing Sales Ecosystem Notifications...\n');

    try {
        // Connect to RabbitMQ
        await connect();
        console.log('✅ Connected to RabbitMQ');

        const companyId = 'test-company-999';
        const shopId = 'test-shop-888';
        const customerPhone = '+250780000000'; // Rwandan format for SMS test

        // 1. SIMULATE SALE.CREATED
        console.log('\n--- Step 1: Simulating sale.created ---');
        const saleCreatedEvent = {
            id: `test-sale-${Date.now()}`,
            source: 'test-script',
            type: 'sale.created',
            data: {
                saleId: 'SALE-1001',
                companyId,
                shopId,
                customerId: 'CUST-001',
                customerName: 'Jean Doe',
                customerPhone,
                soldBy: 'clerk-user-id-555',
                totalAmount: 45000,
                items: [
                    { productName: 'Basmati Rice 5kg', quantity: 2, total: 24000 },
                    { productName: 'Cooking Oil 3L', quantity: 1, total: 21000 }
                ],
                createdAt: new Date().toISOString()
            },
            emittedAt: new Date().toISOString()
        };

        await publish(exchanges.topic, 'sale.created', saleCreatedEvent);
        console.log('✅ sale.created published');

        // 2. SIMULATE SALE.REFUND.PROCESSED
        console.log('\n--- Step 2: Simulating sale.refund.processed ---');
        const refundEvent = {
            id: `test-refund-${Date.now()}`,
            source: 'test-script',
            type: 'sale.refund.processed',
            data: {
                saleId: 'SALE-1001',
                companyId,
                shopId,
                refundAmount: 12000,
                customerName: 'Jean Doe',
                customerPhone,
                performedBy: 'manager-user-id-777', // User who processed the refund
                processedAt: new Date().toISOString()
            },
            emittedAt: new Date().toISOString()
        };

        await publish(exchanges.topic, 'sale.refund.processed', refundEvent);
        console.log('✅ sale.refund.processed published');

        console.log('\n🏁 Test suite completed successfully!');
        console.log('\n🔍 WHAT TO VERIFY IN LOGS:');
        console.log('1. sale.created:');
        console.log('   - Customer should get SMS with item list.');
        console.log('   - Clerk (clerk-user-id-555) should get Push: "Success! You completed a sale..."');
        console.log('   - Admin & Manager should get general summary.');
        console.log('\n2. sale.refund.processed:');
        console.log('   - Customer should get SMS confirmation for 12,000 RWF.');
        console.log('   - Admin & Manager should receive refund alerts.');

        process.exit(0);
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run test
testSalesEcosystem();
