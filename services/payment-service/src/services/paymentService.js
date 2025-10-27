// src/Services/paymentsService.js
require('dotenv').config();
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const redis = require('../..//shared/redis') || require('../shared/redis');
const rabbitmq = require('../../shared/rabbitmq') || require('../shared/rabbitmq');

const {
    MTN_BASE_URL,
    MTN_SUBSCRIPTION_KEY,
    MTN_USER,
    MTN_API_KEY,
    MTN_TARGET_ENVIRONMENT,
    MTN_RETRY_LIMIT = 3,
    MTN_RETRY_DELAY_MS = 1000,
} = process.env;

/* ------------------------------------------------------------------
 * Helper 1: Get Access Token (MTN)
 * ------------------------------------------------------------------ */
async function getMtnAccessToken() {
    try {
        const response = await axios.post(
            `${MTN_BASE_URL}/collection/token/`,
            {},
            {
                headers: {
                    'Ocp-Apim-Subscription-Key': MTN_SUBSCRIPTION_KEY,
                    Authorization: 'Basic ' + Buffer.from(`${MTN_USER}:${MTN_API_KEY}`).toString('base64'),
                },
            }
        );

        return response.data.access_token;
    } catch (err) {
        console.error('Failed to get MTN Access Token:', err.response?.data || err.message);
        throw new Error('Unable to authenticate with MTN MoMo API');
    }
}

/* ------------------------------------------------------------------
 * Helper 2: Send Payment Request (MTN)
 * ------------------------------------------------------------------ */
async function initiateMtnPayment(amount, phoneNumber) {
    try {
        // Create unique reference
        const referenceId = uuidv4();

        // Build body
        const body = {
            amount: amount.toString(),
            currency: 'EUR',
            externalId: referenceId,
            payer: {
                partyIdType: 'MSISDN',
                partyId: phoneNumber.replace('+', ''), // remove + sign if any
            },
            payerMessage: 'Invexis Payment',
            payeeNote: 'Payment via Invexis',
        };

        // Retry loop for transient network/5xx errors
        let attempt = 0;
        let lastErr;
        const retryLimit = parseInt(MTN_RETRY_LIMIT, 10) || 3;
        const retryDelay = parseInt(MTN_RETRY_DELAY_MS, 10) || 1000;

        while (attempt < retryLimit) {
            attempt++;
            try {
                const token = await getMtnAccessToken();
                const response = await axios.post(
                    `${MTN_BASE_URL}/collection/v1_0/requesttopay`,
                    body,
                    {
                        headers: {
                            'X-Reference-Id': referenceId,
                            'X-Target-Environment': MTN_TARGET_ENVIRONMENT,
                            'Ocp-Apim-Subscription-Key': MTN_SUBSCRIPTION_KEY,
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                        timeout: 10000,
                    }
                );

                console.log('MTN MoMo Request Status:', response.status, response.statusText);

                return {
                    message: 'MTN payment initiated',
                    referenceId,
                    status: response.statusText,
                    code: response.status,
                };
            } catch (err) {
                lastErr = err;
                const status = err.response?.status;
                // Retry only on 5xx or network errors
                if (status && status >= 500 && status < 600) {
                    console.warn(`MTN request attempt ${attempt} failed with ${status}, retrying after ${retryDelay}ms`);
                    await new Promise((r) => setTimeout(r, retryDelay));
                    continue;
                }
                // For other errors don't retry
                console.error('MTN Payment Error (non-retry):', err.response?.data || err.message);
                throw new Error('Failed to initiate MTN payment');
            }
        }

        console.error('MTN Payment Error (final):', lastErr?.response?.data || lastErr?.message);
        throw new Error('Failed to initiate MTN payment after retries');
    } catch (err) {
        // Bubble up (most caught above), but normalize
        console.error('MTN Payment Error (outer):', err.response?.data || err.message || err);
        throw err;
    }
}

/* ------------------------------------------------------------------
 * Helper 3: Check Payment Status (MTN)
 * ------------------------------------------------------------------ */
async function checkMtnPaymentStatus(referenceId) {
    try {
        const token = await getMtnAccessToken();
        const response = await axios.get(
            `${MTN_BASE_URL}/collection/v1_0/requesttopay/${referenceId}`,
            {
                headers: {
                    'X-Target-Environment': MTN_TARGET_ENVIRONMENT,
                    'Ocp-Apim-Subscription-Key': MTN_SUBSCRIPTION_KEY,
                    Authorization: `Bearer ${token}`,
                },
            }
        );
        return response.data;
    } catch (err) {
        console.error('MTN Status Check Error:', err.response?.data || err.message);
        throw new Error('Unable to retrieve payment status');
    }
}

/* ------------------------------------------------------------------
 * Main Payment Processor
 * ------------------------------------------------------------------ */
// High-level processPayment with idempotency, caching and event publishing
exports.processPayment = async (provider, amount, phoneNumber, options = {}) => {
    const providerKey = (provider || '').toLowerCase();

    if (!providerKey) throw new Error('Provider required');

    if (providerKey !== 'mtn') {
        throw new Error(`${provider} payment not yet implemented`);
    }

    // Idempotency - use provided idempotencyKey or phone+amount
    const idempotencyKey = options.idempotencyKey || `${providerKey}:${phoneNumber}:${amount}`;
    const cacheKey = `payment:idempotency:${idempotencyKey}`;

    try {
        // Check cache to avoid duplicate requests
        const cached = await redis.get(cacheKey);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                return { cached: true, ...parsed };
            } catch (e) {
                // Fallthrough and overwrite cache
            }
        }

        // Initiate payment
        const result = await initiateMtnPayment(amount, phoneNumber);

        // Cache result with a TTL (short lived)
        try {
            await redis.set(cacheKey, JSON.stringify(result), 'EX', 60 * 5); // 5 minutes
        } catch (e) {
            console.warn('Redis set failed for idempotency cache', e.message);
        }

        // Publish event to RabbitMQ (best-effort)
        try {
            const payload = {
                event: 'payment.initiated',
                provider: providerKey,
                amount,
                phoneNumber,
                result,
                timestamp: Date.now(),
            };
            await rabbitmq.publish(rabbitmq.exchanges.topic, 'payment.initiated', payload, { headers: { source: 'payment-service' } });
        } catch (e) {
            console.warn('RabbitMQ publish failed for payment.initiated', e.message);
        }

        return result;
    } catch (err) {
        // Publish failure event
        try {
            const payload = {
                event: 'payment.failed',
                provider: providerKey,
                amount,
                phoneNumber,
                error: err.message,
                timestamp: Date.now(),
            };
            await rabbitmq.publish(rabbitmq.exchanges.topic, 'payment.failed', payload, { headers: { source: 'payment-service' } });
        } catch (e) {
            console.warn('RabbitMQ publish failed for payment.failed', e.message);
        }

        throw err;
    }
};

exports.checkMtnPaymentStatus = checkMtnPaymentStatus;
