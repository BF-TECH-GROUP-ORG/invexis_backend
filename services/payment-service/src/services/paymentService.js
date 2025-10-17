// src/services/paymentService.js
// Gateway integrations with DB logging, RabbitMQ events, Redis caching (tokens/status).
// Optimized for millions of users: Token caching (5 min TTL), status caching (1 hour for completed), API retries, structured logging.


const axios = require('axios').default;
const Stripe = require('stripe')(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
const knex = require('knex')(require('../../knexfile')[process.env.NODE_ENV || 'development']);
const { publish } = require('/app/shared/rabbitmq');
const redis = require('/app/shared/redis');
const { v4: uuidv4 } = require('uuid');

class PaymentService {
    constructor() {
        this.mtnConfig = {
            baseUrl: process.env.MTN_MOMO_BASE_URL,
            subscriptionKey: process.env.MTN_MOMO_SUBSCRIPTION_KEY,
            apiUser: process.env.MTN_MOMO_API_USER,
            apiKey: process.env.MTN_MOMO_API_KEY,
        };
        this.airtelConfig = {
            baseUrl: process.env.AIRTEL_MONEY_BASE_URL,
            apiKey: process.env.AIRTEL_MONEY_API_KEY,
            apiSecret: process.env.AIRTEL_MONEY_API_SECRET,
        };
        this.cacheTtls = {
            token: 300,  // 5 min for tokens
            statusPending: 300,  // 5 min for pending (poll often)
            statusCompleted: 3600,  // 1 hour for succeeded/failed
        };
    }

    // Retry wrapper for API calls (exponential backoff, max 3 retries)
    async apiCallWithRetry(fn, maxRetries = 3) {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await fn();
            } catch (err) {
                if (attempt === maxRetries - 1) throw err;
                const delay = 1000 * Math.pow(2, attempt);  // 1s, 2s, 4s
                console.warn(`API retry ${attempt + 1}/${maxRetries} after ${delay}ms:`, err.message);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    // Cache tokens in Redis (5 min TTL)
    async getMTNAccessToken() {
        const cacheKey = 'mtn_token';
        let token = await redis.get(cacheKey);
        if (!token) {
            token = await this.apiCallWithRetry(async () => {
                const credentials = Buffer.from(`${this.mtnConfig.apiUser}:${this.mtnConfig.apiKey}`).toString('base64');
                const response = await axios.post(`${this.mtnConfig.baseUrl}/collection/token/`, {}, {
                    headers: {
                        Authorization: `Basic ${credentials}`,
                        'Ocp-Apim-Subscription-Key': this.mtnConfig.subscriptionKey,
                    },
                });
                return response.data.access_token;
            });
            await redis.set(cacheKey, token, 'EX', this.cacheTtls.token);
        }
        return token;
    }

    async initiateMTNPayment({ amount, phoneNumber, transactionId, description, userId, companyId, orderId, lineItems = [] }) {
        const sanitize = (s) => s.replace(/[^a-zA-Z0-9\s]/g, '').slice(0, 160);
        const payerMessage = sanitize(`Pay for ${description}`);
        const payeeNote = sanitize(description);
        try {
            const token = await this.getMTNAccessToken();
            const headers = {
                Authorization: `Bearer ${token}`,
                'X-Reference-Id': transactionId,
                'X-Target-Environment': process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
                'Content-Type': 'application/json',
                'Ocp-Apim-Subscription-Key': this.mtnConfig.subscriptionKey,
            };
            const payload = {
                amount: amount.toString(),
                currency: 'XAF',
                externalId: transactionId,
                payer: { partyIdType: 'MSISDN', partyId: phoneNumber },
                payerMessage,
                payeeNote,
            };
            await this.apiCallWithRetry(async () => axios.post(`${this.mtnConfig.baseUrl}/collection/v1_0/requesttopay`, payload, { headers }));

            // Log to DB (pending)
            await knex('payments').insert({
                payment_id: transactionId,
                user_id: userId,
                company_id: companyId,
                order_id: orderId || null,
                amount,
                currency: 'XAF',
                description,
                method: 'mobile_money',
                gateway: 'mtn_momo',
                gateway_token: phoneNumber,
                status: 'pending',
                metadata: JSON.stringify({ lineItems }),
            });

            // Cache status
            await redis.set(`status:${transactionId}`, 'pending', 'EX', this.cacheTtls.statusPending);

            console.log(`MTN Payment initiated: ${transactionId} for user ${userId}`);
            return { success: true, reference: transactionId };
        } catch (e) {
            console.error('MTN MoMo payment error:', e.response?.data || e.message);
            return { success: false, message: 'Failed to initiate MTN MoMo payment' };
        }
    }

    async checkMTNPaymentStatus(transactionId) {
        const cacheKey = `status:${transactionId}`;
        let status = await redis.get(cacheKey);
        if (status !== null) return { status };

        try {
            const token = await this.getMTNAccessToken();
            const response = await this.apiCallWithRetry(async () => axios.get(`${this.mtnConfig.baseUrl}/collection/v1_0/requesttopay/${transactionId}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'X-Target-Environment': process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
                    'Ocp-Apim-Subscription-Key': this.mtnConfig.subscriptionKey,
                },
            }));
            status = response.data.status;
            const ttl = status === 'SUCCESSFUL' || status === 'FAILED' ? this.cacheTtls.statusCompleted : this.cacheTtls.statusPending;
            await redis.set(cacheKey, status, 'EX', ttl);

            if (status === 'SUCCESSFUL') {
                await knex('payments').where({ payment_id: transactionId }).update({ status: 'succeeded' });
                const payment = await knex('payments').where({ payment_id: transactionId }).first();
                await publish('events_topic', 'payment.succeeded', { payment_id: transactionId, user_id: payment.user_id, company_id: payment.company_id });
                console.log(`MTN Payment succeeded: ${transactionId}`);
            } else if (status === 'FAILED') {
                await knex('payments').where({ payment_id: transactionId }).update({ status: 'failed' });
                await publish('events_topic', 'payment.failed', { payment_id: transactionId });
                console.log(`MTN Payment failed: ${transactionId}`);
            }
            return { status };
        } catch (e) {
            console.error('MTN status check error:', e.response?.data || e.message);
            await redis.set(cacheKey, 'pending', 'EX', this.cacheTtls.statusPending);
            return { status: 'pending' };
        }
    }

    // Airtel Token Cache
    async getAirtelAccessToken() {
        const cacheKey = 'airtel_token';
        let token = await redis.get(cacheKey);
        if (!token) {
            const payload = {
                client_id: this.airtelConfig.apiKey,
                client_secret: this.airtelConfig.apiSecret,
                grant_type: 'client_credentials',
            };
            token = await this.apiCallWithRetry(async () => {
                const response = await axios.post(`${this.airtelConfig.baseUrl}/auth/oauth2/token`, payload, {
                    headers: { 'Content-Type': 'application/json' },
                });
                return response.data.access_token;
            });
            await redis.set(cacheKey, token, 'EX', this.cacheTtls.token);
        }
        return token;
    }

    async initiateAirtelPayment({ amount, phoneNumber, transactionId, description, userId, companyId, orderId, lineItems = [] }) {
        try {
            const msisdn = this.formatPhone(phoneNumber);
            const token = await this.getAirtelAccessToken();
            const payload = {
                reference: transactionId,
                subscriber: { country: 'CM', currency: 'XAF', msisdn },
                transaction: { amount, country: 'CM', currency: 'XAF', id: transactionId },
            };
            const response = await this.apiCallWithRetry(async () => axios.post(`${this.airtelConfig.baseUrl}/merchant/v1/payments/`, payload, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-Country': 'CM',
                    'X-Currency': 'XAF',
                },
            }));

            // Log to DB
            await knex('payments').insert({
                payment_id: transactionId,
                user_id: userId,
                company_id: companyId,
                order_id: orderId || null,
                amount,
                currency: 'XAF',
                description,
                method: 'mobile_money',
                gateway: 'airtel_money',
                gateway_token: msisdn,
                status: 'pending',
                metadata: JSON.stringify({ lineItems }),
            });

            await redis.set(`status:${transactionId}`, 'pending', 'EX', this.cacheTtls.statusPending);

            console.log(`Airtel Payment initiated: ${transactionId} for user ${userId}`);
            return { success: true, reference: response.data.data?.transaction?.id || transactionId };
        } catch (e) {
            console.error('Airtel Money Payment error:', e.response?.data || e.message);
            return { success: false, message: 'Failed to initiate Airtel Money payment' };
        }
    }

    async checkAirtelPaymentStatus(transactionId) {
        const cacheKey = `status:${transactionId}`;
        let status = await redis.get(cacheKey);
        if (status !== null) return { status };

        try {
            const token = await this.getAirtelAccessToken();
            const response = await this.apiCallWithRetry(async () => axios.get(`${this.airtelConfig.baseUrl}/standard/v1/payments/${transactionId}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-Country': 'CM',
                    'X-Currency': 'XAF',
                },
            }));
            status = response.data.data?.transaction?.status;
            const ttl = status === 'TS' || status === 'TF' ? this.cacheTtls.statusCompleted : this.cacheTtls.statusPending;
            await redis.set(cacheKey, status, 'EX', ttl);

            if (status === 'TS') {
                await knex('payments').where({ payment_id: transactionId }).update({ status: 'succeeded' });
                const payment = await knex('payments').where({ payment_id: transactionId }).first();
                await publish('events_topic', 'payment.succeeded', { payment_id: transactionId, user_id: payment.user_id, company_id: payment.company_id });
                console.log(`Airtel Payment succeeded: ${transactionId}`);
            } else if (status === 'TF') {
                await knex('payments').where({ payment_id: transactionId }).update({ status: 'failed' });
                await publish('events_topic', 'payment.failed', { payment_id: transactionId });
                console.log(`Airtel Payment failed: ${transactionId}`);
            }
            return { status };
        } catch (e) {
            console.error('Airtel status check failed:', e.response?.data || e.message);
            await redis.set(cacheKey, 'pending', 'EX', this.cacheTtls.statusPending);
            return { status: 'pending' };
        }
    }

    async initiateStripePayment({ amount, description, transactionId, userId, companyId, orderId, lineItems = [], customerEmail = null }) {
        try {
            const paymentIntent = await this.apiCallWithRetry(async () => Stripe.paymentIntents.create({
                amount: Math.round(amount * 100),
                currency: 'usd',
                metadata: { transactionId, description, lineItems: JSON.stringify(lineItems) },
                receipt_email: customerEmail,
                description,
            }));

            // Log to DB
            await knex('payments').insert({
                payment_id: transactionId,
                user_id: userId,
                company_id: companyId,
                order_id: orderId || null,
                amount,
                currency: 'USD',
                description,
                method: 'card',
                gateway: 'stripe',
                gateway_token: paymentIntent.id,
                status: 'pending',
                metadata: JSON.stringify({ lineItems }),
            });

            await redis.set(`status:${transactionId}`, 'pending', 'EX', this.cacheTtls.statusPending);

            console.log(`Stripe Payment initiated: ${transactionId} for user ${userId}`);
            return { success: true, clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id };
        } catch (e) {
            console.error('Stripe payment error:', e);
            return { success: false, message: 'Failed to initiate card payment' };
        }
    }

    async processMTNWebhook(payload) {
        try {
            const { externalId: transactionId, status, financialTransactionId } = payload;
            const payment = await knex('payments').where({ payment_id: transactionId }).first();
            if (!payment) return { success: false, message: 'Payment not found' };

            if (status === 'SUCCESSFUL') {
                await knex('payments').where({ payment_id: transactionId }).update({
                    status: 'succeeded',
                    gateway_transaction_id: financialTransactionId
                });
                await publish('events_topic', 'payment.succeeded', { payment_id: transactionId, user_id: payment.user_id, company_id: payment.company_id });
                await redis.set(`status:${transactionId}`, 'succeeded', 'EX', this.cacheTtls.statusCompleted);
                console.log(`MTN Webhook succeeded: ${transactionId}`);
            } else if (status === 'FAILED') {
                await knex('payments').where({ payment_id: transactionId }).update({ status: 'failed' });
                await publish('events_topic', 'payment.failed', { payment_id: transactionId });
                await redis.set(`status:${transactionId}`, 'failed', 'EX', this.cacheTtls.statusCompleted);
                console.log(`MTN Webhook failed: ${transactionId}`);
            }
            return { success: true, status };
        } catch (e) {
            console.error('MTN webhook error:', e);
            return { success: false, message: 'Webhook processing failed' };
        }
    }

    async processAirtelWebhook(payload) {
        try {
            const { transactionId, status, referenceId } = payload;
            const payment = await knex('payments').where({ payment_id: transactionId }).first();
            if (!payment) return { success: false, message: 'Payment not found' };

            if (status === 'TS') {
                await knex('payments').where({ payment_id: transactionId }).update({
                    status: 'succeeded',
                    gateway_transaction_id: referenceId
                });
                await publish('events_topic', 'payment.succeeded', { payment_id: transactionId, user_id: payment.user_id, company_id: payment.company_id });
                await redis.set(`status:${transactionId}`, 'succeeded', 'EX', this.cacheTtls.statusCompleted);
                console.log(`Airtel Webhook succeeded: ${transactionId}`);
            } else if (status === 'TF') {
                await knex('payments').where({ payment_id: transactionId }).update({ status: 'failed' });
                await publish('events_topic', 'payment.failed', { payment_id: transactionId });
                await redis.set(`status:${transactionId}`, 'failed', 'EX', this.cacheTtls.statusCompleted);
                console.log(`Airtel Webhook failed: ${transactionId}`);
            }
            return { success: true, status };
        } catch (e) {
            console.error('Airtel webhook error:', e);
            return { success: false, message: 'Webhook processing failed' };
        }
    }

    async processStripeWebhook(payload, signature) {
        try {
            const event = Stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET);
            return { success: true, event };
        } catch (e) {
            console.error('Stripe webhook error:', e);
            return { success: false, message: 'Invalid Webhook Signature' };
        }
    }

    formatPhone(phone) {
        const p = (phone || '').replace(/\D/g, '');
        if (p.startsWith('0')) return `237${p.slice(1)}`;
        if (p.startsWith('237')) return p;
        return `237${p}`;
    }
}

module.exports = new PaymentService();