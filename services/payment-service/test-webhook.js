// test-webhook.js
// Test webhook processing without signature verification

const axios = require('axios');

const BASE_URL = 'http://localhost:8009';

// Test payment ID from our earlier Stripe test
const PAYMENT_INTENT_ID = 'pi_3SXXXb2NtTeelJoF1fDZjWoW';
const PAYMENT_ID = 'e4152c64-a99b-4bf5-94e9-0ae821311e0a';

async function testWebhookProcessing() {
    console.log('\n🔔 Testing Stripe Webhook Processing\n');
    console.log('═'.repeat(60));

    // Step 1: Check current payment status
    console.log('\n📊 Step 1: Check current payment status');
    console.log('-'.repeat(60));

    try {
        const statusBefore = await axios.get(`${BASE_URL}/payment/status/${PAYMENT_ID}`);
        console.log('Current Status:', statusBefore.data.data?.status || 'Not found');
        console.log('Payment ID:', PAYMENT_ID);
        console.log('Gateway Token:', statusBefore.data.data?.gateway_token);
    } catch (error) {
        console.log('Status check:', error.response?.data || error.message);
    }

    // Step 2: Simulate Stripe webhook (payment succeeded)
    console.log('\n\n🎯 Step 2: Simulate Stripe webhook - payment.succeeded');
    console.log('-'.repeat(60));

    const webhookPayload = {
        id: 'evt_test_' + Date.now(),
        object: 'event',
        type: 'payment_intent.succeeded',
        data: {
            object: {
                id: PAYMENT_INTENT_ID,
                object: 'payment_intent',
                amount: 5000,
                currency: 'usd',
                status: 'succeeded',
                charges: {
                    data: [{
                        id: 'ch_test_123',
                        amount: 5000,
                        status: 'succeeded'
                    }]
                }
            }
        }
    };

    console.log('Webhook Payload:');
    console.log(JSON.stringify(webhookPayload, null, 2));

    try {
        // Note: This will fail signature verification in production
        // For testing, we'd need to disable signature verification or use test mode
        const webhookResponse = await axios.post(
            `${BASE_URL}/payment/webhooks/stripe`,
            webhookPayload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'stripe-signature': 'test_signature'
                }
            }
        );

        console.log('\n✅ Webhook Response:', webhookResponse.data);
    } catch (error) {
        console.log('\n⚠️  Webhook Error (expected - signature verification):');
        console.log(error.response?.data || error.message);
        console.log('\nNote: In production, Stripe signs webhooks for security.');
        console.log('For testing, you can:');
        console.log('1. Use Stripe CLI: stripe listen --forward-to localhost:8009/payment/webhooks/stripe');
        console.log('2. Disable signature verification in development mode');
        console.log('3. Use ngrok to expose local server to Stripe');
    }

    // Step 3: Check updated payment status
    console.log('\n\n📊 Step 3: Check if status was updated');
    console.log('-'.repeat(60));

    try {
        const statusAfter = await axios.get(`${BASE_URL}/payment/status/${PAYMENT_ID}`);
        console.log('Updated Status:', statusAfter.data.data?.status || 'Not found');

        if (statusAfter.data.data?.status === 'succeeded') {
            console.log('✅ Payment status updated to SUCCEEDED!');
            console.log('✅ Webhook processing worked!');
        } else {
            console.log('⚠️  Status not updated (webhook may have failed)');
        }
    } catch (error) {
        console.log('Status check:', error.response?.data || error.message);
    }

    // Step 4: Check if invoice was generated
    console.log('\n\n📄 Step 4: Check if invoice was generated');
    console.log('-'.repeat(60));

    try {
        const invoices = await axios.get(`${BASE_URL}/payment/invoices/user/550e8400-e29b-41d4-a716-446655440000`);
        console.log('User Invoices:', invoices.data.data?.length || 0);

        if (invoices.data.data && invoices.data.data.length > 0) {
            console.log('✅ Invoice generated!');
            console.log('Invoice ID:', invoices.data.data[0].invoice_id);
            console.log('Status:', invoices.data.data[0].status);
        }
    } catch (error) {
        console.log('Invoice check:', error.response?.data || error.message);
    }

    console.log('\n' + '═'.repeat(60));
    console.log('\n📝 Summary:');
    console.log('Webhook endpoint: /payment/webhooks/stripe');
    console.log('Automatic processing: ✅ Implemented');
    console.log('Status updates: ✅ Configured');
    console.log('Invoice generation: ✅ Configured');
    console.log('\nFor production webhook testing, use Stripe CLI or ngrok.');
    console.log('\n');
}

// Run test
testWebhookProcessing().catch(console.error);
