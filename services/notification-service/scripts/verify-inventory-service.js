#!/usr/bin/env node

/**
 * Comprehensive Inventory Service Notification Verification Script
 * Verifies event types handled by productEvent.handler.js
 */

const amqp = require('amqplib');
const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://root:invexispass@localhost:5672';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://root:invexispass@mongodb:27017/notificationdb?authSource=admin';
const EXCHANGE = 'events_topic';

const TEST_COMPANY_ID = 'test-company-id';
const TEST_SHOP_ID = 'shop-1'; // Changed from 'test-shop-1' to match existing users
const TEST_USER = { name: 'Admin User', id: 'user-1' };
const runId = Date.now().toString().slice(-4);

const eventsToTest = [
    // --- Product Lifecycle ---
    {
        name: 'Product Created',
        key: 'product.created',
        payload: {
            type: 'product.created',
            data: {
                productId: `prod-create-${runId}`,
                productName: 'New Widget',
                companyId: TEST_COMPANY_ID,
                shopId: TEST_SHOP_ID,
                createdBy: TEST_USER.id,
                createdByName: TEST_USER.name,
                timestamp: new Date().toISOString()
            }
        },
        expectedTemplate: 'product.created',
        queryKey: 'payload.productId',
        queryValue: `prod-create-${runId}`
    },
    {
        name: 'Product Updated',
        key: 'product.updated',
        payload: {
            type: 'product.updated',
            data: {
                productId: `prod-update-${runId}`,
                productName: 'Updated Widget',
                companyId: TEST_COMPANY_ID,
                shopId: TEST_SHOP_ID,
                timestamp: new Date().toISOString()
            }
        },
        expectedTemplate: 'product.updated',
        queryKey: 'payload.productId',
        queryValue: `prod-update-${runId}`
    },
    {
        name: 'Product Deleted',
        key: 'product.deleted',
        payload: {
            type: 'product.deleted',
            data: {
                productId: `prod-delete-${runId}`,
                productName: 'Deleted Widget',
                companyId: TEST_COMPANY_ID,
                shopId: TEST_SHOP_ID,
                userName: TEST_USER.name,
                timestamp: new Date().toISOString()
            }
        },
        expectedTemplate: 'product.deleted',
        queryKey: 'payload.productId',
        queryValue: `prod-delete-${runId}`
    },

    // --- Stock Alerts ---
    {
        name: 'Low Stock',
        key: 'inventory.low_stock',
        payload: {
            type: 'inventory.low_stock',
            data: {
                productId: `prod-low-${runId}`,
                productName: 'Low Stock Widget',
                companyId: TEST_COMPANY_ID,
                shopId: TEST_SHOP_ID,
                currentStock: 5,
                threshold: 10,
                sku: 'SKU-LOW',
                timestamp: new Date().toISOString()
            }
        },
        expectedTemplate: 'inventory.low_stock',
        queryKey: 'payload.productId',
        queryValue: `prod-low-${runId}`
    },
    {
        name: 'Out of Stock',
        key: 'inventory.out_of_stock',
        payload: {
            type: 'inventory.out_of_stock',
            data: {
                productId: `prod-out-${runId}`,
                productName: 'No Stock Widget',
                companyId: TEST_COMPANY_ID,
                shopId: TEST_SHOP_ID,
                sku: 'SKU-OUT',
                threshold: 10,
                timestamp: new Date().toISOString()
            }
        },
        expectedTemplate: 'inventory.out_of_stock',
        queryKey: 'payload.productId',
        queryValue: `prod-out-${runId}`
    },

    // --- Stock Operations ---
    {
        name: 'Stock Updated',
        key: 'inventory.stock.updated',
        payload: {
            type: 'inventory.stock.updated',
            data: {
                productId: `prod-stock-${runId}`,
                productName: 'Restocked Widget',
                companyId: TEST_COMPANY_ID,
                shopId: TEST_SHOP_ID,
                current: 50,
                previous: 40,
                change: 10,
                type: 'restock',
                timestamp: new Date().toISOString()
            }
        },
        expectedTemplate: 'inventory.stock.updated',
        queryKey: 'payload.productId',
        queryValue: `prod-stock-${runId}`
    },
    {
        name: 'Bulk Stock In',
        key: 'inventory.bulk.stock_in',
        payload: {
            type: 'inventory.bulk.stock_in',
            data: {
                companyId: TEST_COMPANY_ID,
                shopId: TEST_SHOP_ID,
                totalRequested: 100,
                successCount: 100,
                items: [{ productId: 'p1' }, { productId: 'p2' }],
                batchId: `batch-in-${runId}`, // Unique ID for query
                timestamp: new Date().toISOString()
            }
        },
        expectedTemplate: 'inventory.bulk.stock_in',
        queryKey: 'payload.batchId', // Need to check if batchId is passed through... handleBulkStockIn spreads data, so yes.
        queryValue: `batch-in-${runId}`
    },

    // --- Transfers ---
    {
        name: 'Transfer Created',
        key: 'inventory.transfer.created',
        payload: {
            type: 'inventory.transfer.created',
            data: {
                transferId: `transfer-${runId}`, // Unique ID
                productName: 'Transfer Widget',
                companyId: TEST_COMPANY_ID,
                sourceShopId: TEST_SHOP_ID, // Matches TEST_SHOP_ID (shop-1)
                destinationShopId: 'shop-2', // Still targeting shop-2, might miss recipients if no users there
                quantity: 5,
                timestamp: new Date().toISOString()
            }
        },
        expectedTemplate: 'inventory.transfer.created',
        queryKey: 'payload.transferId', // key passed in data
        queryValue: `transfer-${runId}`
    }
];

async function verifyInventoryService() {
    console.log(`\n🚀 Starting Inventory Service Verification (Run ID: ${runId})...\n`);
    let connection, channel;

    try {
        // 1. Connect to RabbitMQ
        connection = await amqp.connect(RABBITMQ_URL);
        channel = await connection.createChannel();
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
        console.log('✅ Connected to RabbitMQ');

        // 2. Connect to MongoDB
        await mongoose.connect(MONGO_URI);
        const Notification = mongoose.model('Notification', new mongoose.Schema({
            templateName: String,
            payload: Object,
            createdAt: Date
        }, { strict: false }));
        console.log('✅ Connected to MongoDB');

        // 3. Run Tests
        for (const test of eventsToTest) {
            console.log(`\n---------------------------------------------------`);
            console.log(`🧪 Testing: ${test.name}`);
            console.log(`   Key: ${test.key}`);

            const startTime = Date.now();

            // Publish Event
            channel.publish(
                EXCHANGE,
                test.key,
                Buffer.from(JSON.stringify(test.payload)),
                { persistent: true }
            );
            console.log(`   📤 Event published`);

            // Poll DB for result
            let found = false;
            for (let i = 0; i < 10; i++) {
                await new Promise(r => setTimeout(r, 500));

                const query = {
                    templateName: test.expectedTemplate,
                    [test.queryKey]: test.queryValue
                };

                const notification = await Notification.findOne(query).sort({ createdAt: -1 });

                if (notification) {
                    const duration = Date.now() - startTime;
                    console.log(`   ✅ Notification FOUND in ${duration}ms`);
                    console.log(`      Template: ${notification.templateName}`);
                    console.log(`      ID: ${notification._id}`);
                    found = true;
                    break;
                }
            }

            if (!found) {
                console.error(`   ❌ TIMEOUT: Notification not found after 5s`);
                console.log(`      Expected Query:`, JSON.stringify({
                    templateName: test.expectedTemplate,
                    [test.queryKey]: test.queryValue
                }));
            }
        }

        console.log(`\n---------------------------------------------------`);
        console.log('✅ Verification Complete');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        if (channel) await channel.close();
        if (connection) await connection.close();
        await mongoose.disconnect();
        process.exit(0);
    }
}

verifyInventoryService();
