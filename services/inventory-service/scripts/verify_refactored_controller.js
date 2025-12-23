
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env
dotenv.config({ path: path.join(__dirname, '../.env') });

const OrganizationController = require('../src/controllers/organizationController');
const Product = require('../src/models/Product');
const StockChange = require('../src/models/StockChange');
const Alert = require('../src/models/Alert');
const InventoryAdjustment = require('../src/models/InventoryAdjustment');

// Mock Express Objects
const mockReq = (params = {}, query = {}, body = {}) => ({
    params,
    query,
    body
});

const mockRes = () => {
    const res = {};
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (data) => {
        res.data = data;
        return res;
    };
    return res;
};

async function runVerification() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
        console.log('Connected.');

        // 1. Find a valid Data Context
        const product = await Product.findOne().lean();
        if (!product) {
            console.error('No products found to verify with.');
            process.exit(1);
        }
        const companyId = product.companyId;
        const shopId = 'shop_123'; // Logic to find valid shopId needed? 
        // We can group ProductStock by shopId to find active shop
        const ProductStock = require('../src/models/ProductStock');
        const stock = await ProductStock.findOne({ companyId }).lean();
        const activeShopId = stock ? stock.shopId : 'shop_default';

        console.log(`Using Context: Company=${companyId}, Shop=${activeShopId}`);

        // 2. Verify getShopTopSellers
        console.log('\n--- Verifying getShopTopSellers ---');
        const req1 = mockReq({ shopId: activeShopId }, { companyId });
        const res1 = mockRes();
        await OrganizationController.getShopTopSellers(req1, res1);
        if (res1.data && res1.data.success) {
            console.log('SUCCESS: getShopTopSellers returned data.');
            console.log('Count:', res1.data.count);
            // console.log('First Item:', res1.data.data[0]);
        } else {
            console.error('FAILED: getShopTopSellers', res1.data);
        }

        // 3. Verify getShopAdvancedAnalytics
        console.log('\n--- Verifying getShopAdvancedAnalytics ---');
        const req2 = mockReq({ shopId: activeShopId }, { companyId });
        const res2 = mockRes();
        await OrganizationController.getShopAdvancedAnalytics(req2, res2);
        if (res2.data && res2.data.success) {
            console.log('SUCCESS: getShopAdvancedAnalytics returned data.');
            console.log('Sales Revenue:', res2.data.sales.totalRevenue);
            console.log('Inventory Healthy:', res2.data.inventory.status.healthy);
        } else {
            console.error('FAILED: getShopAdvancedAnalytics', res2.data);
        }

        // 4. Verify getShopPerformanceMetrics
        console.log('\n--- Verifying getShopPerformanceMetrics ---');
        const req3 = mockReq({ shopId: activeShopId }, { companyId });
        const res3 = mockRes();
        await OrganizationController.getShopPerformanceMetrics(req3, res3);
        if (res3.data && res3.data.success) {
            console.log('SUCCESS: getShopPerformanceMetrics returned data.');
            console.log('Growth:', res3.data.growth);
        } else {
            console.error('FAILED: getShopPerformanceMetrics', res3.data);
        }

        // 5. Verify getCompanyOverview
        console.log('\n--- Verifying getCompanyOverview ---');
        const req4 = mockReq({ companyId });
        const res4 = mockRes();
        await OrganizationController.getCompanyOverview(req4, res4);
        if (res4.data && res4.data.success) {
            console.log('SUCCESS: getCompanyOverview returned data.');
            console.log('Total Stock:', res4.data.data.totalStock);
            console.log('Low Stock Count:', res4.data.data.lowStockCount);
        } else {
            console.error('FAILED: getCompanyOverview', res4.data);
        }

    } catch (err) {
        console.error('Error during verification:', err);
    } finally {
        await mongoose.disconnect();
    }
}

runVerification();
