// src/services/gateways/mtnMomoGateway.js
// MTN Mobile Money gateway integration

require('dotenv').config();
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const {
    MTN_MOMO_BASE_URL,
    MTN_MOMO_SUBSCRIPTION_KEY,
    MTN_MOMO_API_USER,
    MTN_MOMO_API_KEY,
    MTN_TARGET_ENVIRONMENT = 'sandbox',
    MTN_RETRY_LIMIT = 3,
    MTN_RETRY_DELAY_MS = 1000,
} = process.env;

// For backward compatibility and cleaner code
const MTN_BASE_URL = MTN_MOMO_BASE_URL?.trim();
const MTN_SUBSCRIPTION_KEY = MTN_MOMO_SUBSCRIPTION_KEY?.trim();
const MTN_USER = MTN_MOMO_API_USER?.trim();
const MTN_API_KEY = MTN_MOMO_API_KEY?.trim();
const MTN_ENV = MTN_TARGET_ENVIRONMENT?.trim() || 'sandbox';

// Validate MTN credentials
const MTN_CONFIGURED = !!(MTN_BASE_URL && MTN_SUBSCRIPTION_KEY && MTN_USER && MTN_API_KEY);

if (!MTN_CONFIGURED) {
    console.warn('⚠️ MTN MoMo gateway not configured: Missing environment variables. MTN payments will not be available.');
}

class MTNMomoGateway {
    /**
     * Get MTN MoMo access token
     * @returns {Promise<string>} Access token
     */
    async getAccessToken() {
        if (!MTN_CONFIGURED) {
            throw new Error('MTN MoMo gateway is not configured. Please set MTN_MOMO_BASE_URL, MTN_MOMO_SUBSCRIPTION_KEY, MTN_MOMO_API_USER, and MTN_MOMO_API_KEY in your .env file.');
        }

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
        } catch (error) {
            const errorDetails = error.response?.data || error.message;
            console.error('MTN Access Token Error:', errorDetails);

            if (error.response?.data?.error === 'invalid_client') {
                throw new Error('MTN API authentication failed: Invalid API credentials.');
            }

            throw new Error(`Unable to authenticate with MTN MoMo API: ${JSON.stringify(errorDetails)}`);
        }
    }

    /**
     * Initiate MTN MoMo payment
     */
    async initiatePayment(paymentData) {
        if (!MTN_CONFIGURED) {
            throw new Error('MTN MoMo gateway not configured');
        }
        const { amount, currency, phoneNumber, description } = paymentData;
        const referenceId = uuidv4();

        const body = {
            amount: amount.toString(),
            currency: currency || 'RWF',
            externalId: referenceId,
            payer: {
                partyIdType: 'MSISDN',
                partyId: phoneNumber.replace(/[^0-9]/g, ''),
            },
            payerMessage: description || 'Payment via Invexis',
            payeeNote: 'Payment via Invexis',
        };

        try {
            const token = await this.getAccessToken();
            const response = await axios.post(
                `${MTN_BASE_URL}/collection/v1_0/requesttopay`,
                body,
                {
                    headers: {
                        'X-Reference-Id': referenceId,
                        'X-Target-Environment': MTN_ENV,
                        'Ocp-Apim-Subscription-Key': MTN_SUBSCRIPTION_KEY,
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 10000,
                }
            );

            return {
                success: true,
                reference_id: referenceId,
                status: 'pending',
                message: 'MTN payment initiated',
                gateway_response: {
                    status_code: response.status
                }
            };
        } catch (error) {
            console.error('MTN Payment Error:', error.response?.data || error.message);
            throw new Error(`MTN payment initiation failed: ${error.message}`);
        }
    }

    /**
     * Check MTN MoMo payment status
     */
    async checkPaymentStatus(reference_id) {
        if (!MTN_CONFIGURED) throw new Error('MTN NOT CONFIGURED');
        try {
            const token = await this.getAccessToken();
            const response = await axios.get(
                `${MTN_BASE_URL}/collection/v1_0/requesttopay/${reference_id}`,
                {
                    headers: {
                        'X-Target-Environment': MTN_ENV,
                        'Ocp-Apim-Subscription-Key': MTN_SUBSCRIPTION_KEY,
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            return {
                success: true,
                reference_id,
                status: response.data.status.toLowerCase(),
                amount: response.data.amount,
                currency: response.data.currency
            };
        } catch (error) {
            console.error('MTN Status Check Error:', error.message);
            throw new Error('Unable to retrieve MTN payment status');
        }
    }

    /**
     * Handle MTN MoMo callback/webhook
     */
    async handleCallback(callbackData) {
        return {
            event_type: callbackData.status === 'SUCCESSFUL' ? 'payment_succeeded' : 'payment_failed',
            reference_id: callbackData.externalId,
            status: callbackData.status.toLowerCase()
        };
    }
}

module.exports = new MTNMomoGateway();