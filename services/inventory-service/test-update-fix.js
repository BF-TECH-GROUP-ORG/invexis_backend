require('dotenv').config();
const mongoose = require('mongoose');

// Pre-register models
require('./src/models/Product');
require('./src/models/Category');
require('./src/models/ProductPricing');
require('./src/models/ProductStock');
require('./src/models/ProductVariation');
require('./src/models/productSpecs');
require('./src/models/ProductAudit');

const productController = require('./src/controllers/productController');
const Product = require('./src/models/Product');

async function runTest() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/invexis-dev');
        console.log('✅ Connected to MongoDB');

        const testProduct = await Product.findOne({ isDeleted: false });
        if (!testProduct) {
            console.log('❌ No products found to test against.');
            process.exit(0);
        }

        console.log(`🔍 Testing updateProduct for ID: ${testProduct._id}`);

        // Mock payload from user logs
        const mockBody = {
            availability: "out_of_stock",
            brand: "Rem in odio sit temp",
            categoryId: String(testProduct.categoryId),
            companyId: testProduct.companyId,
            condition: "refurbished",
            costPrice: 15,
            description: "Commodo deleniti vel",
            identifiers: {
                sku: testProduct.sku, // Keep same SKU to avoid error
            },
            images: [
                { url: "https://example.com/img1.jpg", isPrimary: true, sortOrder: 0 }
            ],
            inventory: {
                allowBackorder: false,
                lowStockThreshold: 32,
                minReorderQty: 0,
                safetyStock: 0,
                stockQty: 91,
                trackQuantity: true
            },
            isFeatured: true,
            manufacturer: "Quia et quia quo opt",
            name: "Test Update Normalization",
            pricing: {
                basePrice: 98,
                cost: 15,
                currency: "USD",
                listPrice: 0,
                priceTiers: [],
                salePrice: 19
            },
            shopId: testProduct.shopId,
            sortOrder: 14,
            specs: [
                { name: "brand", value: "Sit dolores consequ" }
            ],
            status: {
                active: true,
                availability: "out_of_stock",
                condition: "refurbished",
                deletedAt: null,
                deletedBy: null,
                featured: true,
                isDeleted: false,
                visible: true // Changed to true to test mapping
            },
            supplierName: "Cum eum nobis ut ame",
            tags: ["ut fugiat amet recu"],
            videoUrls: [],
            visibility: "hidden" // This might be overridden by status.visible
        };

        const req = {
            params: { id: String(testProduct._id) },
            body: mockBody,
            query: {},
            headers: {},
            user: { id: 'test-user' }
        };

        const res = {
            status: function (code) {
                this.statusCode = code;
                return this;
            },
            json: function (data) {
                this.data = data;
                return this;
            }
        };

        // Call the controller directly
        // Note: asyncHandler will handle the response or pass error to next
        await productController.updateProduct(req, res, (err) => {
            if (err) throw err;
        });

        if (res.statusCode === 200 && res.data.success) {
            console.log('✅ updateProduct succeeded!');
            console.log('Updated Status:', res.data.data.status);
            console.log('Updated Visibility:', res.data.data.visibility);
            console.log('Updated SKU (via identifiers):', res.data.data.sku);

            // Verify in DB
            const updated = await Product.findById(testProduct._id).lean();
            if (updated.status === 'active' && updated.visibility === 'public') {
                console.log('✅ DB Verification successful (Status mapped to active, Visibility mapped to public)');
            } else {
                console.log(`⚠️ DB Verification: status=${updated.status}, visibility=${updated.visibility}`);
            }
        } else {
            console.log('❌ updateProduct failed:', res.statusCode, res.data);
        }

        process.exit(0);
    } catch (err) {
        console.error('❌ Test failed:', err);
        process.exit(1);
    }
}

runTest();
