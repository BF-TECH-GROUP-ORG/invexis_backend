#!/usr/bin/env node

/**
 * Super Move Push Notification Tester
 * 
 * This script simulates a real "Low Stock" event from the inventory-service.
 * It will trigger the full backend pipeline:
 * 1. RabbitMQ (inventory.low_stock)
 * 2. Notification Service (Event Consumer)
 * 3. Recipient Resolution (Finding Company Admins)
 * 4. Channel Selection (Push/In-App/Email)
 * 5. Push Delivery (Firebase Admin SDK)
 */

const amqp = require('amqplib');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://invexis:invexispass@localhost:5672';

// ⚠️ CHANGE THESE TO MATCH YOUR TEST DATA
const CONFIG = {
    companyId: 'company-uuid-123', // Must match the companyId of your registered Admin
    shopId: 'shop-uuid-456',
    productName: 'Super Move Widget',
    currentStock: 5,
    threshold: 10
};

async function triggerSuperMoveTest() {
    let connection, channel;

    try {
        console.log('\n🚀 Starting Super Move Push Test...\n');

        connection = await amqp.connect(RABBITMQ_URL);
        channel = await connection.createChannel();

        const exchange = 'events_topic';
        await channel.assertExchange(exchange, 'topic', { durable: true });

        const event = {
            type: 'inventory.low_stock',
            source: 'inventory-service',
            data: {
                productId: 'prod-test-001',
                productName: CONFIG.productName,
                companyId: CONFIG.companyId,
                shopId: CONFIG.shopId,
                currentStock: CONFIG.currentStock,
                threshold: CONFIG.threshold,
                sku: 'SM-WGT-001',
                suggestedReorderQty: 50,
                percentageOfThreshold: (CONFIG.currentStock / CONFIG.threshold) * 100,
                timestamp: new Date().toISOString()
            }
        };

        const routingKey = 'inventory.low_stock';

        console.log(`📡 Publishing event: ${routingKey}`);
        console.log(`🏢 Target Company: ${CONFIG.companyId}`);
        console.log(`📦 Product: ${CONFIG.productName}`);

        channel.publish(
            exchange,
            routingKey,
            Buffer.from(JSON.stringify(event)),
            {
                persistent: true,
                contentType: 'application/json',
                headers: { 'x-internal-request': 'true' }
            }
        );

        console.log('\n✅ Event published successfully!');
        console.log('--------------------------------------------------');
        console.log('💡 NEXT STEPS:');
        console.log('1. Ensure your Next.js app has registered an fcmToken for this company admin.');
        console.log('2. Check notification-service logs for "✅ Push sent to token".');
        console.log('3. Watch your device for the "Low Stock Alert" popup!\n');

        // Give it a moment to send before closing
        setTimeout(async () => {
            await channel.close();
            await connection.close();
            process.exit(0);
        }, 1000);

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (connection) await connection.close();
        process.exit(1);
    }
}

triggerSuperMoveTest();
