const mongoose = require('mongoose');
const axios = require('axios');
const ProductTransfer = require('./services/inventory-service/src/models/ProductTransfer.js');
const { MONGODB_URI } = process.env;

// Mock environment for missing vars if needed, but we rely on hardcoded URI for now if not present,
// Actually, I can't know the URI. I must assume the script runs in an environment where it can connect.
// Since I cannot know the URI, I will try to connect to localhost default or rely on the user running it in a context with env vars.
// However, the best way is to use `run_command` to execute this script using `node` and assuming the environment variables are loaded or available in the shell context.
// But usually I don't have the env vars.

// Plan B: I will use the `run_command` to inspect the environment variable or `config` files? No.
// I can try to connect to 'mongodb://localhost:27017/invexis' which is standard.

async function verifyTransfers() {
    try {
        await mongoose.connect('mongodb://localhost:27017/invexis');
        console.log('Connected to MongoDB');

        const companyId = '660e8400-e29b-41d4-a716-446655440000';

        // 1. Check if ANY transfers exist for this company
        const count = await ProductTransfer.countDocuments({
            $or: [{ sourceCompanyId: companyId }, { destinationCompanyId: companyId }]
        });
        console.log(`Found ${count} transfers for company ${companyId}`);

        if (count === 0) {
            console.log('Inserting dummy transfer...');

            await ProductTransfer.create({
                transferId: `TEST-${Date.now()}`,
                transferType: 'intra_company',
                status: 'completed',
                sourceCompanyId: companyId,
                sourceShopId: 'test-source-shop',
                destinationCompanyId: companyId,
                destinationShopId: 'test-dest-shop',
                productId: new mongoose.Types.ObjectId(),
                productName: 'Test Product',
                quantity: 5,
                reason: 'Verification Test',
                performedBy: { userId: 'test-user' },
                transferredProductData: { pricing: { basePrice: 100 } },
                actualValue: 500,
                initiatedAt: new Date()
            });
            console.log('Dummy transfer inserted.');
        }

        // 2. Fetch via internal logic (simulating the controller query)
        const transfers = await ProductTransfer.find({
            $or: [{ sourceCompanyId: companyId }, { destinationCompanyId: companyId }]
        }).lean();

        console.log('Transfers found:', transfers.length);
        console.log('Sample ID:', transfers[0]?._id);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

verifyTransfers();
