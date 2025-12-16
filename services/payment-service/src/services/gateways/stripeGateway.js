// src/services/gateways/stripeGateway.js
// Stripe payment gateway integration

require('dotenv').config();
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

class StripeGateway {
    /**
     * Create a payment intent
     * @param {Object} paymentData - Payment information
     * @returns {Promise<Object>} Stripe payment intent
     */
    async createPaymentIntent(paymentData) {
        const { amount, currency, description, metadata, customer_email } = paymentData;

        try {
            const paymentIntent = await stripe.paymentIntents.create({
                amount: Math.round(amount), // Stripe expects amount in smallest currency unit
                currency: (currency || 'xaf').toLowerCase(),
                description,
                metadata: metadata || {},
                receipt_email: customer_email,
                automatic_payment_methods: {
                    enabled: true,
                },
            });

            return {
                success: true,
                payment_intent_id: paymentIntent.id,
                client_secret: paymentIntent.client_secret,
                status: paymentIntent.status,
                amount: paymentIntent.amount,
                currency: paymentIntent.currency
            };
        } catch (error) {
            console.error('Stripe Payment Intent Error:', error.message);
            throw new Error(`Stripe error: ${error.message}`);
        }
    }

    /**
     * Confirm a payment intent
     * @param {string} payment_intent_id - Stripe payment intent ID
     * @param {Object} paymentMethod - Payment method details
     * @returns {Promise<Object>} Confirmed payment intent
     */
    async confirmPayment(payment_intent_id, paymentMethod) {
        try {
            const paymentIntent = await stripe.paymentIntents.confirm(payment_intent_id, {
                payment_method: paymentMethod
            });

            return {
                success: true,
                payment_intent_id: paymentIntent.id,
                status: paymentIntent.status,
                amount: paymentIntent.amount,
                currency: paymentIntent.currency
            };
        } catch (error) {
            console.error('Stripe Confirm Payment Error:', error.message);
            throw new Error(`Stripe confirmation error: ${error.message}`);
        }
    }

    /**
     * Retrieve payment intent status
     * @param {string} payment_intent_id - Stripe payment intent ID
     * @returns {Promise<Object>} Payment intent details
     */
    async getPaymentStatus(payment_intent_id) {
        try {
            const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);

            return {
                success: true,
                payment_intent_id: paymentIntent.id,
                status: paymentIntent.status,
                amount: paymentIntent.amount,
                currency: paymentIntent.currency,
                charges: paymentIntent.charges.data
            };
        } catch (error) {
            console.error('Stripe Get Status Error:', error.message);
            throw new Error(`Stripe status check error: ${error.message}`);
        }
    }

    /**
     * Refund a payment
     * @param {string} payment_intent_id - Stripe payment intent ID
     * @param {number} amount - Amount to refund (optional, full refund if not specified)
     * @returns {Promise<Object>} Refund details
     */
    async refundPayment(payment_intent_id, amount = null) {
        try {
            const refundData = { payment_intent: payment_intent_id };
            if (amount) {
                refundData.amount = Math.round(amount);
            }

            const refund = await stripe.refunds.create(refundData);

            return {
                success: true,
                refund_id: refund.id,
                status: refund.status,
                amount: refund.amount,
                currency: refund.currency
            };
        } catch (error) {
            console.error('Stripe Refund Error:', error.message);
            throw new Error(`Stripe refund error: ${error.message}`);
        }
    }

    /**
     * Handle Stripe webhook events
     * @param {Object} event - Stripe webhook event
     * @returns {Promise<Object>} Processed event data
     */
    async handleWebhook(event) {
        const { type, data } = event;

        switch (type) {
            case 'payment_intent.succeeded':
                return {
                    event_type: 'payment_succeeded',
                    payment_intent_id: data.object.id,
                    amount: data.object.amount,
                    currency: data.object.currency,
                    status: 'succeeded'
                };

            case 'payment_intent.payment_failed':
                return {
                    event_type: 'payment_failed',
                    payment_intent_id: data.object.id,
                    amount: data.object.amount,
                    currency: data.object.currency,
                    status: 'failed',
                    failure_message: data.object.last_payment_error?.message
                };

            case 'charge.refunded':
                return {
                    event_type: 'payment_refunded',
                    charge_id: data.object.id,
                    amount_refunded: data.object.amount_refunded,
                    currency: data.object.currency
                };

            default:
                return {
                    event_type: type,
                    data: data.object
                };
        }
    }

    /**
     * Verify webhook signature
     * @param {string} payload - Raw request body
     * @param {string} signature - Stripe signature header
     * @returns {Object} Verified event
     */
    verifyWebhookSignature(payload, signature) {
        try {
            const event = stripe.webhooks.constructEvent(
                payload,
                signature,
                process.env.STRIPE_WEBHOOK_SECRET
            );
            return event;
        } catch (error) {
            console.error('Stripe Webhook Verification Error:', error.message);
            throw new Error('Invalid webhook signature');
        }
    }
}

module.exports = new StripeGateway();
