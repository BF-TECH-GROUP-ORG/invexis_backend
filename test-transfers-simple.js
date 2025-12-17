#!/usr/bin/env node

/**
 * Simple Transfer Test Script
 * Tests both intra-company and cross-company bulk transfers without transactions
 */

const axios = require('axios');

const API_BASE = 'http://localhost:8007/inventory/v1';

// Test data (use real IDs from your database)
const TEST_CONFIG = {
    companyId: '2b51c838-8dc2-4c38-bbe1-fbeda67fae1f',
    sourceShopId: '239be384-2469-4676-bdf5-3df331064c96',
    destinationShopId: '6e81a8b8-6d55-4430-a710-b7de92186932',
    productId: '6941899d41f182b08a61f442', // Must be a valid ObjectId
    userId: '693bdc4da7711ed4e52ca5a1',
    authToken: process.env.AUTH_TOKEN || 'your-token-here'
};

// Helper function to make API calls
async function apiCall(method, endpoint, data = null) {
    try {
        const config = {
            method,
            url: `${API_BASE}${endpoint}`,
            headers: {
                'Authorization': `Bearer ${TEST_CONFIG.authToken}`,
                'Content-Type': 'application/json'
            }
        };

        if (data) {
            config.data = data;
        }

        const response = await axios(config);
        return response.data;
    } catch (error) {
        if (error.response?.data) {
            return error.response.data;
        }
        throw error;
    }
}

// Test 1: Intra-company bulk transfer
async function testIntraCompanyTransfer() {
    console.log('\n📦 TEST 1: Intra-Company Bulk Transfer');
    console.log('========================================\n');

    const payload = {
        transfers: [
            {
                productId: TEST_CONFIG.productId,
                quantity: 1
            }
        ],
        toShopId: TEST_CONFIG.destinationShopId,
        reason: 'Test transfer - no transactions',
        userId: TEST_CONFIG.userId,
        notes: 'Simplified transfer test'
    };

    console.log('Request payload:', JSON.stringify(payload, null, 2));

    try {
        const endpoint = `/companies/${TEST_CONFIG.companyId}/shops/${TEST_CONFIG.sourceShopId}/bulk-transfer`;
        const result = await apiCall('POST', endpoint, payload);

        console.log('\n✅ Response:', JSON.stringify(result, null, 2));

        if (result.success || result.data?.successful?.length > 0) {
            console.log('\n✅ TEST 1 PASSED: Intra-company transfer successful\n');
            return true;
        } else {
            console.log('\n❌ TEST 1 FAILED: Transfer did not complete\n');
            return false;
        }
    } catch (error) {
        console.error('\n❌ TEST 1 ERROR:', error.message);
        return false;
    }
}

// Test 2: Cross-company bulk transfer (if you have multiple companies)
async function testCrossCompanyTransfer() {
    console.log('\n🌍 TEST 2: Cross-Company Bulk Transfer');
    console.log('========================================\n');

    // Note: This requires a different destination company
    const destinationCompanyId = process.env.DEST_COMPANY_ID || '3c51c838-8dc2-4c38-bbe1-fbeda67fae1f';
    const destinationShopId = process.env.DEST_SHOP_ID || '7f81a8b8-6d55-4430-a710-b7de92186932';

    const payload = {
        transfers: [
            {
                productId: TEST_CONFIG.productId,
                quantity: 1
            }
        ],
        toCompanyId: destinationCompanyId,
        toShopId: destinationShopId,
        reason: 'Test cross-company transfer - no transactions',
        userId: TEST_CONFIG.userId,
        notes: 'Simplified cross-company transfer test'
    };

    console.log('Request payload:', JSON.stringify(payload, null, 2));

    try {
        const endpoint = `/companies/${TEST_CONFIG.companyId}/shops/${TEST_CONFIG.sourceShopId}/bulk-cross-company-transfer`;
        const result = await apiCall('POST', endpoint, payload);

        console.log('\n✅ Response:', JSON.stringify(result, null, 2));

        if (result.success || result.data?.successful?.length > 0) {
            console.log('\n✅ TEST 2 PASSED: Cross-company transfer successful\n');
            return true;
        } else {
            console.log('\n❌ TEST 2 FAILED: Transfer did not complete\n');
            return false;
        }
    } catch (error) {
        console.error('\n❌ TEST 2 ERROR:', error.message);
        return false;
    }
}

// Main test runner
async function runTests() {
    console.log('🚀 Starting Transfer Tests (No Transactions)\n');
    console.log('Configuration:');
    console.log(`- API Base: ${API_BASE}`);
    console.log(`- Company: ${TEST_CONFIG.companyId}`);
    console.log(`- Source Shop: ${TEST_CONFIG.sourceShopId}`);
    console.log(`- Destination Shop: ${TEST_CONFIG.destinationShopId}`);
    console.log(`- Product: ${TEST_CONFIG.productId}\n`);

    const results = [];

    // Run test 1
    results.push(await testIntraCompanyTransfer());

    // Wait a second between tests
    await new Promise(r => setTimeout(r, 1000));

    // Run test 2 (optional, if env vars are set)
    if (process.env.DEST_COMPANY_ID) {
        results.push(await testCrossCompanyTransfer());
    } else {
        console.log('⏭️  Skipping cross-company test (set DEST_COMPANY_ID to enable)\n');
    }

    // Summary
    console.log('\n📊 TEST SUMMARY');
    console.log('=================');
    console.log(`Total Tests: ${results.length}`);
    console.log(`Passed: ${results.filter(r => r).length}`);
    console.log(`Failed: ${results.filter(r => !r).length}`);

    const allPassed = results.every(r => r);
    console.log(`\nOverall: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}\n`);

    process.exit(allPassed ? 0 : 1);
}

// Run
runTests().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
