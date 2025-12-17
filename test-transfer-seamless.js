#!/usr/bin/env node

/**
 * Comprehensive Transfer Testing Suite
 * Tests both intra-company and cross-company transfers
 * Validates seamless execution and error handling
 */

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const BASE_URL = process.env.BASE_URL || 'http://localhost:8007/inventory/v1';
const API_TOKEN = process.env.API_TOKEN || 'your-test-token';

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

const log = {
    success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
    error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
    info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
    warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
    section: (msg) => console.log(`\n${colors.cyan}═══ ${msg} ═══${colors.reset}\n`)
};

// Test data
const TEST_DATA = {
    companyId: '2b51c838-8dc2-4c38-bbe1-fbeda67fae1f',
    sourceShopId: '239be384-2469-4676-bdf5-3df331064c96',
    destShopId: '6e81a8b8-6d55-4430-a710-b7de92186932',
    userId: '693bdc4da7711ed4e52ca5a1',
    productId: '6941899d41f182b08a61f442'
};

// Test configuration
let stats = {
    passed: 0,
    failed: 0,
    errors: []
};

/**
 * Execute transfer request
 */
async function executeTransfer(type, payload) {
    try {
        const endpoint = type === 'intra' 
            ? `/companies/${TEST_DATA.companyId}/shops/${TEST_DATA.sourceShopId}/bulk-transfer`
            : `/companies/${TEST_DATA.companyId}/shops/${TEST_DATA.sourceShopId}/bulk-cross-company-transfer`;

        const response = await axios.post(`${BASE_URL}${endpoint}`, payload, {
            headers: { 'Authorization': `Bearer ${API_TOKEN}` }
        });

        return {
            success: true,
            status: response.status,
            data: response.data
        };
    } catch (error) {
        return {
            success: false,
            status: error.response?.status,
            message: error.response?.data?.message || error.message,
            data: error.response?.data
        };
    }
}

/**
 * Test 1: Valid Intra-Company Transfer
 */
async function testValidIntraCompanyTransfer() {
    log.section('Test 1: Valid Intra-Company Transfer');

    const payload = {
        transfers: [
            {
                productId: TEST_DATA.productId,
                quantity: 3
            }
        ],
        toShopId: TEST_DATA.destShopId,
        reason: 'Test intra-company transfer',
        userId: TEST_DATA.userId,
        notes: 'Automated test'
    };

    const result = await executeTransfer('intra', payload);

    if (result.success && [200, 207].includes(result.status)) {
        log.success('Intra-company transfer successful');
        log.info(`Status: ${result.status}, Message: ${result.data?.message}`);
        stats.passed++;
        return true;
    } else {
        log.error('Intra-company transfer failed');
        log.info(`Status: ${result.status}, Error: ${result.message}`);
        stats.failed++;
        stats.errors.push(`Test 1: ${result.message}`);
        return false;
    }
}

/**
 * Test 2: Invalid Intra-Company Transfer (missing toShopId)
 */
async function testMissingToShopId() {
    log.section('Test 2: Missing toShopId (Validation)');

    const payload = {
        transfers: [
            {
                productId: TEST_DATA.productId,
                quantity: 2
            }
        ],
        reason: 'Test missing toShopId',
        userId: TEST_DATA.userId
    };

    const result = await executeTransfer('intra', payload);

    if (!result.success && result.status === 400) {
        log.success('Properly rejected request with missing toShopId');
        log.info(`Message: ${result.message}`);
        stats.passed++;
        return true;
    } else {
        log.error('Should have rejected request with missing toShopId');
        stats.failed++;
        stats.errors.push('Test 2: Missing toShopId validation failed');
        return false;
    }
}

/**
 * Test 3: Invalid Transfer (same source and destination)
 */
async function testSameSourceDest() {
    log.section('Test 3: Same Source and Destination Validation');

    const payload = {
        transfers: [
            {
                productId: TEST_DATA.productId,
                quantity: 1
            }
        ],
        toShopId: TEST_DATA.sourceShopId,
        reason: 'Test same source/dest',
        userId: TEST_DATA.userId
    };

    const result = await executeTransfer('intra', payload);

    if (!result.success && result.status === 400) {
        log.success('Properly rejected same source/dest transfer');
        log.info(`Message: ${result.message}`);
        stats.passed++;
        return true;
    } else {
        log.error('Should have rejected same source/dest transfer');
        stats.failed++;
        stats.errors.push('Test 3: Same source/dest validation failed');
        return false;
    }
}

/**
 * Test 4: Empty Transfers Array
 */
async function testEmptyTransfersArray() {
    log.section('Test 4: Empty Transfers Array Validation');

    const payload = {
        transfers: [],
        toShopId: TEST_DATA.destShopId,
        reason: 'Test empty transfers',
        userId: TEST_DATA.userId
    };

    const result = await executeTransfer('intra', payload);

    if (!result.success && result.status === 400) {
        log.success('Properly rejected empty transfers array');
        log.info(`Message: ${result.message}`);
        stats.passed++;
        return true;
    } else {
        log.error('Should have rejected empty transfers array');
        stats.failed++;
        stats.errors.push('Test 4: Empty transfers array validation failed');
        return false;
    }
}

/**
 * Test 5: Invalid Product ID Format
 */
async function testInvalidProductIdFormat() {
    log.section('Test 5: Invalid Product ID Format Validation');

    const payload = {
        transfers: [
            {
                productId: 'invalid-id-format',
                quantity: 1
            }
        ],
        toShopId: TEST_DATA.destShopId,
        reason: 'Test invalid product ID',
        userId: TEST_DATA.userId
    };

    const result = await executeTransfer('intra', payload);

    if (!result.success && result.status === 400) {
        log.success('Properly rejected invalid product ID format');
        log.info(`Message: ${result.message}`);
        stats.passed++;
        return true;
    } else {
        log.error('Should have rejected invalid product ID format');
        stats.failed++;
        stats.errors.push('Test 5: Invalid product ID validation failed');
        return false;
    }
}

/**
 * Test 6: Invalid Quantity
 */
async function testInvalidQuantity() {
    log.section('Test 6: Invalid Quantity Validation');

    const payload = {
        transfers: [
            {
                productId: TEST_DATA.productId,
                quantity: -5
            }
        ],
        toShopId: TEST_DATA.destShopId,
        reason: 'Test invalid quantity',
        userId: TEST_DATA.userId
    };

    const result = await executeTransfer('intra', payload);

    if (!result.success && result.status === 400) {
        log.success('Properly rejected invalid quantity');
        log.info(`Message: ${result.message}`);
        stats.passed++;
        return true;
    } else {
        log.error('Should have rejected invalid quantity');
        stats.failed++;
        stats.errors.push('Test 6: Invalid quantity validation failed');
        return false;
    }
}

/**
 * Test 7: Multiple Transfers in Single Request
 */
async function testMultipleTransfers() {
    log.section('Test 7: Multiple Transfers in Single Request');

    const payload = {
        transfers: [
            {
                productId: TEST_DATA.productId,
                quantity: 2
            },
            {
                productId: TEST_DATA.productId,
                quantity: 1
            }
        ],
        toShopId: TEST_DATA.destShopId,
        reason: 'Test multiple transfers',
        userId: TEST_DATA.userId,
        notes: 'Multiple items in one batch'
    };

    const result = await executeTransfer('intra', payload);

    if (result.success && [200, 207].includes(result.status)) {
        const successful = result.data?.data?.successful?.length || 0;
        log.success(`Multiple transfers processed`);
        log.info(`Successful: ${successful}/2, Status: ${result.status}`);
        stats.passed++;
        return true;
    } else {
        log.error('Multiple transfers request failed');
        log.info(`Error: ${result.message}`);
        stats.failed++;
        stats.errors.push(`Test 7: ${result.message}`);
        return false;
    }
}

/**
 * Run all tests
 */
async function runAllTests() {
    console.log(`${colors.cyan}
╔═══════════════════════════════════════════╗
║  Transfer Seamless Testing Suite          ║
║  Validating bulk transfer operations      ║
╚═══════════════════════════════════════════╝
${colors.reset}`);

    log.info(`Base URL: ${BASE_URL}`);
    log.info(`Company ID: ${TEST_DATA.companyId}\n`);

    // Run tests
    await testValidIntraCompanyTransfer();
    await testMissingToShopId();
    await testSameSourceDest();
    await testEmptyTransfersArray();
    await testInvalidProductIdFormat();
    await testInvalidQuantity();
    await testMultipleTransfers();

    // Summary
    log.section('Test Results Summary');
    log.success(`Passed: ${stats.passed}`);
    log.error(`Failed: ${stats.failed}`);
    log.info(`Total: ${stats.passed + stats.failed}`);

    if (stats.errors.length > 0) {
        log.section('Error Details');
        stats.errors.forEach((err, i) => {
            console.log(`${i + 1}. ${err}`);
        });
    }

    const exitCode = stats.failed === 0 ? 0 : 1;
    console.log(`\n${colors.cyan}Exit code: ${exitCode}${colors.reset}\n`);
    process.exit(exitCode);
}

// Run tests
runAllTests().catch(error => {
    log.error(`Unexpected error: ${error.message}`);
    process.exit(1);
});
