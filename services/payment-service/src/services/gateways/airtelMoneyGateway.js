// src/services/gateways/airtelMoneyGateway.js
// Airtel Money payment gateway integration

require('dotenv').config();
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const {
    AIRTEL_MONEY_API_KEY,
    AIRTEL_MONEY_API_SECRET,
    AIRTEL_MONEY_BASE_URL,
} = process.env;

class AirtelMoneyGateway {
    /**
     * Get Airtel Money access token
     * @returns {Promise<string>} Access token
     */
    async getAccessToken() {
        try {
            const response = await axios.post(
                `${AIRTEL_MONEY_BASE_URL}/auth/oauth2/token`,
                {
                    client_id: AIRTEL_MONEY_API_KEY,
                    client_secret: AIRTEL_MONEY_API_SECRET,
                    grant_type: 'client_credentials'
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );

            return response.data.access_token;
        } catch (error) {
            console.error('Airtel Access Token Error:', error.response?.data || error.message);
            throw new Error('Unable to authenticate with Airtel Money API');
        }
    }

    /**
     * Initiate Airtel Money payment
     * @param {Object} paymentData - Payment information
     * @returns {Promise<Object>} Payment initiation result
     */
    async initiatePayment(paymentData) {
        const { amount, currency, phoneNumber, description, metadata } = paymentData;
        const transactionId = uuidv4();

        try {
            const token = await this.getAccessToken();

            const body = {
                reference: transactionId,
                subscriber: {
                    country: metadata?.country || 'UG', // Uganda
                    currency: currency || 'UGX',
                    msisdn: phoneNumber.replace(/[^0-9]/g, '')
                },
                transaction: {
                    amount: amount.toString(),
                    country: metadata?.country || 'UG',
                    currency: currency || 'UGX',
                    id: transactionId
                }
            };

            const response = await axios.post(
                `${AIRTEL_MONEY_BASE_URL}/merchant/v1/payments/`,
                body,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'X-Country': metadata?.country || 'UG',
                        'X-Currency': currency || 'UGX'
                    },
                    timeout: 10000,
                }
            );

            const data = response.data;

            return {
                success: true,
                reference_id: transactionId,
                transaction_id: data.data?.transaction?.id,
                status: data.status?.code === '200' ? 'pending' : 'failed',
                message: data.status?.message || 'Airtel payment initiated',
                gateway_response: data
            };
        } catch (error) {
            console.error('Airtel Payment Error:', error.response?.data || error.message);
            throw new Error(`Airtel payment initiation failed: ${error.response?.data?.status?.message || error.message}`);
        }
    }

    /**
     * Check Airtel Money payment status
     * @param {string} transaction_id - Airtel transaction ID
     * @returns {Promise<Object>} Payment status
     */
    async checkPaymentStatus(transaction_id) {
        try {
            const token = await this.getAccessToken();

            const response = await axios.get(
                `${AIRTEL_MONEY_BASE_URL}/standard/v1/payments/${transaction_id}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                }
            );

            const data = response.data;

            return {
                success: true,
                transaction_id,
                status: data.data?.transaction?.status?.toLowerCase() || 'unknown',
                amount: data.data?.transaction?.amount,
                currency: data.data?.transaction?.currency,
                gateway_response: data
            };
        } catch (error) {
            console.error('Airtel Status Check Error:', error.response?.data || error.message);
            throw new Error('Unable to retrieve Airtel payment status');
        }
    }

    /**
     * Handle Airtel Money callback/webhook
     * @param {Object} callbackData - Callback payload
     * @returns {Promise<Object>} Processed callback data
     */
    async handleCallback(callbackData) {
        const { transaction } = callbackData;

        return {
            event_type: transaction?.status === 'TS' ? 'payment_succeeded' : 'payment_failed',
            transaction_id: transaction?.id,
            reference_id: transaction?.reference,
            amount: transaction?.amount,
            currency: transaction?.currency,
            status: transaction?.status,
            message: transaction?.message
        };
    }
}

module.exports = new AirtelMoneyGateway();
