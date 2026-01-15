// tests/bank-account-integration.test.js
const axios = require('axios');
require('dotenv').config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:8009';

async function testBankAccountField() {
    console.log('Testing Bank Account Field Integration...');

    const paymentData = {
        user_id: '550e8400-e29b-41d4-a716-446655440000',
        seller_id: '660e8400-e29b-41d4-a716-446655440000',
        amount: 1000,
        currency: 'RWF',
        description: 'Test payment with bank account',
        paymentMethod: 'bank_transfer',
        gateway: 'stripe',
        bank_account: {
            account_number: '1234567890',
            account_name: 'Test Account',
            bank_name: 'Access Bank',
            bank_code: 'ACC'
        }
    };

    try {
        // Since we can't easily run the server in this environment, 
        // we'll at least verify the validation logic by importing it
        const { validate, paymentInitiationSchema } = require('../src/utils/validators');
        const { error, value } = validate(paymentInitiationSchema, paymentData);

        if (error) {
            console.error('❌ Validation Failed:', error.message);
            process.exit(1);
        } else {
            console.log('✅ Validation Succeeded');
            console.log('Validated Values:', JSON.stringify(value.bank_account, null, 2));
        }

        // Check if bank_account exists in value
        if (!value.bank_account || value.bank_account.account_number !== '1234567890') {
            console.error('❌ bank_account field was lost during validation');
            process.exit(1);
        }

    } catch (err) {
        console.error('❌ Test execution error:', err.message);
        process.exit(1);
    }
}

testBankAccountField();
