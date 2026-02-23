const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://root:invexispass@mongodb:27017/inventorydb?authSource=admin';

async function trigger() {
    try {
        console.log('🚀 Connecting to Inventory DB...');
        await mongoose.connect(MONGO_URI);

        // Register Product and Alert models
        require('../src/models/Product');
        require('../src/models/Alert');
        require('../src/models/ProductPricing');
        require('../src/models/Category');
        require('../src/models/ProductStock');
        require('../src/models/Outbox'); // Ensure Outbox is registered if needed

        const Product = mongoose.model('Product');
        const Alert = mongoose.model('Alert');
        const AlertTriggerService = require('../src/services/alertTriggerService');

        const companyId = 'test-company-id';
        const shopId = 'shop-1';
        const productName = 'E2E Expiry Test Product';

        // 1. Cleanup
        console.log('🧹 Cleaning up old test data...');
        await Product.deleteMany({ name: productName });
        await Alert.deleteMany({ companyId, type: { $in: ['product_expiring', 'product_expired'] } });

        // 2. Create Product
        console.log('📦 Creating test product...');
        const product = await Product.create({
            name: productName,
            sku: 'E2E-EXP-001',
            companyId,
            shopId,
            categoryId: new mongoose.Types.ObjectId(), // Mock category
            brand: 'Test Brand',
            description: 'Test Description',
            expiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
            status: 'active'
        });
        console.log(`✅ Product created: ${product._id}`);

        // 3. Trigger Expiration Check
        console.log('🔍 Triggering expiration check...');
        await AlertTriggerService.checkProductExpirations(companyId, shopId);

        console.log('✅ Check complete. Verification script should now check notification-service logs/db.');

    } catch (err) {
        console.error('❌ Trigger failed:', err);
    } finally {
        await mongoose.disconnect();
    }
}

trigger();
