#!/usr/bin/env node
/**
 * Test Script: Inventory Events
 * Publishes inventory.low_stock and inventory.out_of_stock events
 */

const { publish, connect, exchanges } = require('/app/shared/rabbitmq');

async function testInventoryEvents() {
    console.log('🧪 Testing inventory events...\n');

    try {
        // Connect to RabbitMQ
        await connect();
        console.log('✅ Connected to RabbitMQ');

        // Test 1: Low Stock Event
        console.log('\n📦 Test 1: inventory.low_stock');
        console.log('─'.repeat(50));

        const lowStockEvent = {
            id: `test-low-stock-${Date.now()}`,
            source: 'test-script',
            type: 'inventory.low_stock',
            data: {
                productId: 'product-low-001',
                companyId: '46e5d562-34f2-4892-a83a-c9cf55b60006',
                shopId: '39cf5aad-6a0f-4be8-90ba-675930d4b927',
                productName: 'Test Product - Low Stock',
                currentStock: 5,
                threshold: 10,
                sku: 'TEST-SKU-001',
                alertedAt: new Date().toISOString()
            },
            emittedAt: new Date().toISOString()
        };

        console.log(JSON.stringify(lowStockEvent, null, 2));
        await publish(exchanges.topic, 'inventory.low_stock', lowStockEvent);
        console.log('✅ inventory.low_stock event published');

        // Wait a bit before next test
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Test 2: Out of Stock Event
        console.log('\n📦 Test 2: inventory.out_of_stock');
        console.log('─'.repeat(50));

        const outOfStockEvent = {
            id: `test-out-stock-${Date.now()}`,
            source: 'test-script',
            type: 'inventory.out_of_stock',
            data: {
                productId: 'product-out-002',
                companyId: '46e5d562-34f2-4892-a83a-c9cf55b60006',
                shopId: '39cf5aad-6a0f-4be8-90ba-675930d4b927',
                productName: 'Test Product - Out of Stock',
                currentStock: 0,
                sku: 'TEST-SKU-002',
                lastSaleAt: new Date(Date.now() - 3600000).toISOString(),
                alertedAt: new Date().toISOString()
            },
            emittedAt: new Date().toISOString()
        };

        console.log(JSON.stringify(outOfStockEvent, null, 2));
        await publish(exchanges.topic, 'inventory.out_of_stock', outOfStockEvent);
        console.log('✅ inventory.out_of_stock event published');

        // Wait a bit before next test
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Test 3: Product Created (renamed from inventory.product.created)
        console.log('\n📦 Test 3: product.created');
        console.log('─'.repeat(50));

        const productCreatedEvent = {
            id: `test-product-${Date.now()}`,
            source: 'test-script',
            type: 'product.created',
            data: {
                productId: 'product-new-003',
                companyId: '46e5d562-34f2-4892-a83a-c9cf55b60006',
                shopId: '39cf5aad-6a0f-4be8-90ba-675930d4b927',
                productName: 'New Test Product',
                sku: 'TEST-SKU-003',
                price: 99.99,
                category: 'Electronics',
                createdAt: new Date().toISOString()
            },
            emittedAt: new Date().toISOString()
        };

        console.log(JSON.stringify(productCreatedEvent, null, 2));
        await publish(exchanges.topic, 'product.created', productCreatedEvent);
        console.log('✅ product.created event published');

        console.log('\n✅ All inventory events published successfully!');
        console.log('\n🔍 Expected behavior:');
        console.log('  1. Notification-service receives all three events');
        console.log('  2. Routes to productEvent.handler');
        console.log('  3. Applies channel mapping from eventChannelMapping.js');
        console.log('     - low_stock: email, push, in-app (high priority)');
        console.log('     - out_of_stock: email, sms, push, in-app (urgent priority)');
        console.log('     - product.created: in-app (low priority)');
        console.log('\n📝 Check notification-service logs for processing confirmation');

        process.exit(0);
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run test
testInventoryEvents();
