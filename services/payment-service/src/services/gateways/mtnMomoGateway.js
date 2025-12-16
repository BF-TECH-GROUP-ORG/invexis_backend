// src/services/gateways/mtnMomoGateway.js
// MTN Mobile Money gateway integration

require('dotenv').config();
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const {
    MTN_BASE_URL,
    MTN_SUBSCRIPTION_KEY,
    MTN_USER,
    MTN_API_KEY,
    MTN_TARGET_ENVIRONMENT,
    MTN_RETRY_LIMIT = 3,
    MTN_RETRY_DELAY_MS = 1000,
} = process.env;

// Validate MTN credentials
if (!MTN_BASE_URL || !MTN_SUBSCRIPTION_KEY || !MTN_USER || !MTN_API_KEY) {
    throw new Error('Missing one or more MTN MoMo environment variables (MTN_BASE_URL, MTN_SUBSCRIPTION_KEY, MTN_USER, MTN_API_KEY). Please check your .env file.');
}

class MTNMomoGateway {
    /**
     * Get MTN MoMo access token
     * @returns {Promise<string>} Access token
     */
    async getAccessToken() {
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
                throw new Error('MTN API authentication failed: Invalid API credentials. Please verify your MTN_USER, MTN_API_KEY, and MTN_SUBSCRIPTION_KEY in the .env file. You may need to create a new API user in the MTN Developer Portal.');
            }

            throw new Error(`Unable to authenticate with MTN MoMo API: ${JSON.stringify(errorDetails)}`);
        }
    }

    /**
     * Initiate MTN MoMo payment
     * @param {Object} paymentData - Payment information
     * @returns {Promise<Object>} Payment initiation result
     */
    async initiatePayment(paymentData) {
        const { amount, currency, phoneNumber, description, metadata } = paymentData;
        const referenceId = uuidv4();

        const body = {
            amount: amount.toString(),
            currency: currency || 'EUR',
            externalId: referenceId,
            payer: {
                partyIdType: 'MSISDN',
                partyId: phoneNumber.replace(/[^0-9]/g, ''), // Remove non-numeric characters
            },
            payerMessage: description || 'Invexis Payment',
            payeeNote: 'Payment via Invexis',
        };

        // Retry logic for transient errors
        let attempt = 0;
        const retryLimit = parseInt(MTN_RETRY_LIMIT, 10) || 3;
        const retryDelay = parseInt(MTN_RETRY_DELAY_MS, 10) || 1000;

        while (attempt < retryLimit) {
            attempt++;
            try {
                const token = await this.getAccessToken();
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
                    success: true,
                    reference_id: referenceId,
                    status: 'pending',
                    message: 'MTN payment initiated successfully',
                    gateway_response: {
                        status_code: response.status,
                        status_text: response.statusText
                    }
                };
            } catch (error) {
                const status = error.response?.status;

                // Retry only on 5xx or network errors
                if (status && status >= 500 && status < 600 && attempt < retryLimit) {
                    console.warn(`MTN request attempt ${attempt} failed with ${status}, retrying after ${retryDelay}ms`);
                    await new Promise((resolve) => setTimeout(resolve, retryDelay));
                    continue;
                }

                // For other errors, don't retry
                console.error('MTN Payment Error:', error.response?.data || error.message);
                throw new Error(`MTN payment initiation failed: ${error.response?.data?.message || error.message}`);
            }
        }

        throw new Error('MTN payment failed after maximum retries');
    }

    /**
     * Check MTN MoMo payment status
     * @param {string} reference_id - MTN reference ID
     * @returns {Promise<Object>} Payment status
     */
    async checkPaymentStatus(reference_id) {
        try {
            const token = await this.getAccessToken();
            const response = await axios.get(
                `${MTN_BASE_URL}/collection/v1_0/requesttopay/${reference_id}`,
                {
                    headers: {
                        'X-Target-Environment': MTN_TARGET_ENVIRONMENT,
                        'Ocp-Apim-Subscription-Key': MTN_SUBSCRIPTION_KEY,
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            const data = response.data;

            return {
                success: true,
                reference_id,
                status: data.status.toLowerCase(), // PENDING, SUCCESSFUL, FAILED
                amount: data.amount,
                currency: data.currency,
                financial_transaction_id: data.financialTransactionId,
                external_id: data.externalId,
                payer: data.payer,
                reason: data.reason
            };
        } catch (error) {
            console.error('MTN Status Check Error:', error.response?.data || error.message);
            throw new Error('Unable to retrieve MTN payment status');
        }
    }

    /**
     * Handle MTN MoMo callback/webhook
     * @param {Object} callbackData - Callback payload
     * @returns {Promise<Object>} Processed callback data
     */
    async handleCallback(callbackData) {
        const { financialTransactionId, externalId, amount, currency, payer, status, reason } = callbackData;

        return {
            event_type: status === 'SUCCESSFUL' ? 'payment_succeeded' : 'payment_failed',
            reference_id: externalId,
            financial_transaction_id: financialTransactionId,
            amount,
            currency,
            payer,
            status: status.toLowerCase(),
            reason
        };
    }
}

module.exports = new MTNMomoGateway();
