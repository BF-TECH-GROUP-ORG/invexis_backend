#!/usr/bin/env node

/**
 * Stock Diagnostic Script
 * Checks current stock levels and product status
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Database connection
async function connectDB() {
    try {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/invexis_inventory';
        await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ MongoDB Connected');
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        process.exit(1);
    }
}

// Load models
function loadModels() {
    require('./services/inventory-service/src/models/Product');
    require('./services/inventory-service/src/models/ProductStock');
    require('./services/inventory-service/src/models/ProductPricing');
    require('./services/inventory-service/src/models/StockChange');
    require('./services/inventory-service/src/models/ProductTransfer');
}

async function checkProductStock() {
    const Product = mongoose.model('Product');
    const ProductStock = mongoose.model('ProductStock');
    const ProductPricing = mongoose.model('ProductPricing');
    const StockChange = mongoose.model('StockChange');

    const productId = '6941899d41f182b08a61f442';
    const companyId = '2b51c838-8dc2-4c38-bbe1-fbeda67fae1f';
    const sourceShopId = '239be384-2469-4676-bdf5-3df331064c96';
    const destinationShopId = '6e81a8b8-6d55-4430-a710-b7de92186932';

    console.log('\n📊 STOCK DIAGNOSTIC REPORT');
    console.log('=' . repeat(60));

    // Check Product
    console.log('\n🔍 Checking Product:');
    const product = await Product.findById(productId);
    if (product) {
        console.log(`✅ Product found: ${product.name}`);
        console.log(`   - ID: ${product._id}`);
        console.log(`   - Company: ${product.companyId}`);
        console.log(`   - Shop: ${product.shopId}`);
        console.log(`   - SKU: ${product.sku}`);
    } else {
        console.log(`❌ Product NOT found with ID: ${productId}`);
    }

    // Check Source Stock
    console.log('\n📦 Source Shop Stock:');
    const sourceStock = await ProductStock.findOne({
        productId,
        shopId: sourceShopId,
        companyId
    });
    if (sourceStock) {
        console.log(`✅ Stock record found`);
        console.log(`   - Quantity: ${sourceStock.stockQty}`);
        console.log(`   - Track Quantity: ${sourceStock.trackQuantity}`);
        console.log(`   - Low Stock Threshold: ${sourceStock.lowStockThreshold}`);
        console.log(`   - In Stock: ${sourceStock.inStock}`);
    } else {
        console.log(`❌ NO stock record for source shop`);
    }

    // Check Destination Stock
    console.log('\n📦 Destination Shop Stock:');
    const destStock = await ProductStock.findOne({
        productId,
        shopId: destinationShopId,
        companyId
    });
    if (destStock) {
        console.log(`✅ Stock record found`);
        console.log(`   - Quantity: ${destStock.stockQty}`);
    } else {
        console.log(`❌ NO stock record for destination shop`);
    }

    // Check Pricing
    console.log('\n💰 Pricing:');
    const pricing = await ProductPricing.findOne({ productId });
    if (pricing) {
        console.log(`✅ Pricing found`);
        console.log(`   - Cost: ${pricing.cost}`);
        console.log(`   - Price: ${pricing.price}`);
        console.log(`   - Currency: ${pricing.currency}`);
    } else {
        console.log(`❌ NO pricing found`);
    }

    // Check Recent Stock Changes
    console.log('\n📋 Recent Stock Changes:');
    const changes = await StockChange.find({
        productId,
        companyId,
        shopId: sourceShopId
    }).sort({ createdAt: -1 }).limit(5);

    if (changes.length > 0) {
        console.log(`✅ Found ${changes.length} recent stock changes:`);
        changes.forEach((change, idx) => {
            console.log(`\n   Change ${idx + 1}:`);
            console.log(`   - Type: ${change.type}`);
            console.log(`   - Qty: ${change.qty}`);
            console.log(`   - Previous: ${change.previous} → New: ${change.new}`);
            console.log(`   - Reason: ${change.reason}`);
            console.log(`   - Date: ${change.createdAt.toISOString()}`);
        });
    } else {
        console.log(`⚠️  NO stock changes found`);
    }

    // Summary
    console.log('\n\n📊 SUMMARY:');
    console.log('=' . repeat(60));
    
    if (sourceStock && sourceStock.stockQty > 0) {
        console.log(`✅ READY: Source has ${sourceStock.stockQty} units available`);
        console.log('   You can proceed with transfer');
    } else if (sourceStock) {
        console.log(`⚠️  WARNING: Source shop has 0 stock`);
        console.log('   Need to add stock before transfer');
    } else {
        console.log(`❌ CRITICAL: No stock record exists for source shop`);
        console.log('   Need to create stock record first');
    }

    console.log('\n');
}

async function main() {
    try {
        await connectDB();
        loadModels();
        await checkProductStock();
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
    }
}

main();
