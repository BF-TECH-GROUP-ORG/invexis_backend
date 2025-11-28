// test-payment.js
// Comprehensive test script for Payment Service

require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8009';

// Test UUIDs (you can replace these with real ones from your database)
const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const TEST_SELLER_ID = '660e8400-e29b-41d4-a716-446655440000';

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
    console.log('\n' + '='.repeat(60));
    log(title, 'cyan');
    console.log('='.repeat(60) + '\n');
}

// Test 1: Health Check
async function testHealthCheck() {
    logSection('TEST 1: Health Check');
    try {
        const response = await axios.get(`${BASE_URL}/health`);
        log('✓ Health check passed', 'green');
        console.log(JSON.stringify(response.data, null, 2));
        return true;
    } catch (error) {
        log('✗ Health check failed', 'red');
        console.error(error.message);
        return false;
    }
}

// Test 2: MTN MoMo Payment Initiation
async function testMTNMoMoPayment() {
    logSection('TEST 2: MTN MoMo Payment Initiation');

    const paymentData = {
        user_id: TEST_USER_ID,
        seller_id: TEST_SELLER_ID,
        amount: 1000,
        currency: 'EUR',
        description: 'Test MTN MoMo payment',
        paymentMethod: 'mobile_money',
        gateway: 'mtn_momo',
        phoneNumber: '46733123450', // MTN sandbox test number
        metadata: {
            test: true,
            environment: 'sandbox'
        }
    };

    try {
        log('Sending payment request...', 'yellow');
        console.log('Request data:', JSON.stringify(paymentData, null, 2));

        const response = await axios.post(`${BASE_URL}/payment/initiate`, paymentData);

        log('✓ MTN MoMo payment initiated successfully', 'green');
        console.log('Response:', JSON.stringify(response.data, null, 2));

        // Return payment_id for status check
        return response.data.data.payment_id;
    } catch (error) {
        log('✗ MTN MoMo payment failed', 'red');
        if (error.response) {
            console.error('Error response:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }
        return null;
    }
}

// Test 3: Stripe Payment Initiation
async function testStripePayment() {
    logSection('TEST 3: Stripe Payment Initiation');

    const paymentData = {
        user_id: TEST_USER_ID,
        seller_id: TEST_SELLER_ID,
        amount: 5000,
        currency: 'USD',
        description: 'Test Stripe payment',
        paymentMethod: 'card',
        gateway: 'stripe',
        customerEmail: 'test@example.com',
        lineItems: [
            {
                name: 'Test Product',
                quantity: 1,
                unit_price: 5000,
                total: 5000
            }
        ]
    };

    try {
        log('Sending Stripe payment request...', 'yellow');
        console.log('Request data:', JSON.stringify(paymentData, null, 2));

        const response = await axios.post(`${BASE_URL}/payment/initiate`, paymentData);

        log('✓ Stripe payment initiated successfully', 'green');
        console.log('Response:', JSON.stringify(response.data, null, 2));

        return response.data.data.payment_id;
    } catch (error) {
        log('✗ Stripe payment failed', 'red');
        if (error.response) {
            console.error('Error response:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }
        return null;
    }
}

// Test 4: Check Payment Status
async function testPaymentStatus(payment_id) {
    logSection('TEST 4: Check Payment Status');

    if (!payment_id) {
        log('⚠ No payment_id provided, skipping status check', 'yellow');
        return;
    }

    try {
        log(`Checking status for payment: ${payment_id}`, 'yellow');

        const response = await axios.get(`${BASE_URL}/payment/status/${payment_id}`);

        log('✓ Payment status retrieved', 'green');
        console.log('Status:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        log('✗ Failed to get payment status', 'red');
        if (error.response) {
            console.error('Error response:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }
    }
}

// Test 5: Get User Payments
async function testGetUserPayments() {
    logSection('TEST 5: Get User Payments');

    try {
        log(`Getting payments for user: ${TEST_USER_ID}`, 'yellow');

        const response = await axios.get(`${BASE_URL}/payment/user/${TEST_USER_ID}?limit=10`);

        log('✓ User payments retrieved', 'green');
        console.log(`Found ${response.data.data.length} payments`);
        console.log('Payments:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        log('✗ Failed to get user payments', 'red');
        if (error.response) {
            console.error('Error response:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }
    }
}

// Test 6: Get Seller Payments
async function testGetSellerPayments() {
    logSection('TEST 6: Get Seller Payments');

    try {
        log(`Getting payments for seller: ${TEST_SELLER_ID}`, 'yellow');

        const response = await axios.get(`${BASE_URL}/payment/seller/${TEST_SELLER_ID}?limit=10`);

        log('✓ Seller payments retrieved', 'green');
        console.log(`Found ${response.data.data.length} payments`);
        console.log('Payments:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        log('✗ Failed to get seller payments', 'red');
        if (error.response) {
            console.error('Error response:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }
    }
}

// Test 7: Get Payment Statistics
async function testPaymentStats() {
    logSection('TEST 7: Get Payment Statistics');

    try {
        log('Getting payment statistics...', 'yellow');

        const response = await axios.get(`${BASE_URL}/payment/reports/stats`);

        log('✓ Payment statistics retrieved', 'green');
        console.log('Stats:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        log('✗ Failed to get payment statistics', 'red');
        if (error.response) {
            console.error('Error response:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }
    }
}

// Test 8: Get Gateway Performance
async function testGatewayPerformance() {
    logSection('TEST 8: Get Gateway Performance');

    try {
        log('Getting gateway performance...', 'yellow');

        const response = await axios.get(`${BASE_URL}/payment/reports/gateway-performance`);

        log('✓ Gateway performance retrieved', 'green');
        console.log('Performance:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        log('✗ Failed to get gateway performance', 'red');
        if (error.response) {
            console.error('Error response:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }
    }
}

// Main test runner
async function runAllTests() {
    console.clear();
    log('\n🚀 INVEXIS PAYMENT SERVICE - TEST SUITE\n', 'cyan');
    log(`Testing against: ${BASE_URL}`, 'blue');
    log(`User ID: ${TEST_USER_ID}`, 'blue');
    log(`Seller ID: ${TEST_SELLER_ID}`, 'blue');

    // Test 1: Health Check
    const healthOk = await testHealthCheck();
    if (!healthOk) {
        log('\n⚠ Service is not healthy. Please start the service first.', 'red');
        log('Run: npm run dev', 'yellow');
        return;
    }

    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 2: MTN MoMo Payment
    const mtnPaymentId = await testMTNMoMoPayment();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 3: Stripe Payment
    const stripePaymentId = await testStripePayment();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 4: Check Payment Status (MTN)
    if (mtnPaymentId) {
        await testPaymentStatus(mtnPaymentId);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Test 5: Get User Payments
    await testGetUserPayments();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 6: Get Seller Payments
    await testGetSellerPayments();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 7: Payment Statistics
    await testPaymentStats();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 8: Gateway Performance
    await testGatewayPerformance();

    // Summary
    logSection('TEST SUITE COMPLETE');
    log('✓ All tests executed', 'green');
    log('\nNote: Some tests may fail if database is not set up or service is not running.', 'yellow');
    log('To fix: Ensure PostgreSQL is running and run migrations (npm run migrate:latest)', 'yellow');
}

// Run tests if called directly
if (require.main === module) {
    runAllTests().catch(error => {
        console.error('Test suite error:', error);
        process.exit(1);
    });
}

module.exports = {
    testHealthCheck,
    testMTNMoMoPayment,
    testStripePayment,
    testPaymentStatus,
    testGetUserPayments,
    testGetSellerPayments,
    testPaymentStats,
    testGatewayPerformance
};
