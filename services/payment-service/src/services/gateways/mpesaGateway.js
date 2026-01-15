// src/services/gateways/mpesaGateway.js
// M-Pesa payment gateway integration (Safaricom - Kenya)

require('dotenv').config();
const axios = require('axios');

const {
    MPESA_CONSUMER_KEY,
    MPESA_CONSUMER_SECRET,
    MPESA_BASE_URL,
    MPESA_SHORTCODE,
    MPESA_PASSKEY,
    MPESA_CALLBACK_URL,
} = process.env;

class MpesaGateway {
    /**
     * Get M-Pesa access token
     * @returns {Promise<string>} Access token
     */
    async getAccessToken() {
        try {
            const auth = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString('base64');

            const response = await axios.get(
                `${MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
                {
                    headers: {
                        Authorization: `Basic ${auth}`,
                    },
                }
            );

            return response.data.access_token;
        } catch (error) {
            console.error('M-Pesa Access Token Error:', error.response?.data || error.message);
            throw new Error('Unable to authenticate with M-Pesa API');
        }
    }

    /**
     * Generate M-Pesa password
     * @param {string} timestamp - Timestamp in format YYYYMMDDHHmmss
     * @returns {string} Base64 encoded password
     */
    generatePassword(timestamp) {
        const password = Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`).toString('base64');
        return password;
    }

    /**
     * Get current timestamp in M-Pesa format
     * @returns {string} Timestamp (YYYYMMDDHHmmss)
     */
    getTimestamp() {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hour = String(date.getHours()).padStart(2, '0');
        const minute = String(date.getMinutes()).padStart(2, '0');
        const second = String(date.getSeconds()).padStart(2, '0');

        return `${year}${month}${day}${hour}${minute}${second}`;
    }

    /**
     * Initiate M-Pesa STK Push payment
     * @param {Object} paymentData - Payment information
     * @returns {Promise<Object>} Payment initiation result
     */
    async initiatePayment(paymentData) {
        const { amount, phoneNumber, description, metadata, payee, reference_id } = paymentData;

        try {
            const token = await this.getAccessToken();
            const timestamp = this.getTimestamp();
            const password = this.generatePassword(timestamp);

            // Use internal reference ID or Payee Name for AccountReference (vital for reconciliation)
            // Truncate to 12 chars as per some M-Pesa API limits, or keep it safe
            const accountRef = reference_id || (payee ? payee.name : 'Invexis');

            const body = {
                BusinessShortCode: MPESA_SHORTCODE,
                Password: password,
                Timestamp: timestamp,
                TransactionType: 'CustomerPayBillOnline',
                Amount: Math.round(amount),
                PartyA: phoneNumber.replace(/[^0-9]/g, ''),
                PartyB: MPESA_SHORTCODE,
                PhoneNumber: phoneNumber.replace(/[^0-9]/g, ''),
                CallBackURL: MPESA_CALLBACK_URL,
                AccountReference: accountRef.substring(0, 12), // Safaricom limit often 12 chars
                TransactionDesc: description || (payee ? `Payment for ${payee.name}` : 'Payment via Invexis')
            };

            // Log routing info if payee is provided
            if (payee && payee.mpesa_phone) {
                console.log(`Initiating M-Pesa payment for payee (${payee.name}): ${payee.mpesa_phone}`);
            }

            const response = await axios.post(
                `${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`,
                body,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 10000,
                }
            );

            const data = response.data;

            return {
                success: data.ResponseCode === '0',
                checkout_request_id: data.CheckoutRequestID,
                merchant_request_id: data.MerchantRequestID,
                status: data.ResponseCode === '0' ? 'pending' : 'failed',
                message: data.ResponseDescription || data.CustomerMessage,
                gateway_response: data
            };
        } catch (error) {
            console.error('M-Pesa Payment Error:', error.response?.data || error.message);
            throw new Error(`M-Pesa payment initiation failed: ${error.response?.data?.errorMessage || error.message}`);
        }
    }

    /**
     * Query M-Pesa payment status
     * @param {string} checkout_request_id - M-Pesa checkout request ID
     * @returns {Promise<Object>} Payment status
     */
    async checkPaymentStatus(checkout_request_id) {
        try {
            const token = await this.getAccessToken();
            const timestamp = this.getTimestamp();
            const password = this.generatePassword(timestamp);

            const body = {
                BusinessShortCode: MPESA_SHORTCODE,
                Password: password,
                Timestamp: timestamp,
                CheckoutRequestID: checkout_request_id
            };

            const response = await axios.post(
                `${MPESA_BASE_URL}/mpesa/stkpushquery/v1/query`,
                body,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            const data = response.data;

            return {
                success: true,
                checkout_request_id,
                merchant_request_id: data.MerchantRequestID,
                status: data.ResultCode === '0' ? 'succeeded' : 'failed',
                result_code: data.ResultCode,
                result_desc: data.ResultDesc,
                gateway_response: data
            };
        } catch (error) {
            console.error('M-Pesa Status Check Error:', error.response?.data || error.message);
            throw new Error('Unable to retrieve M-Pesa payment status');
        }
    }

    /**
     * Handle M-Pesa callback/webhook
     * @param {Object} callbackData - Callback payload
     * @returns {Promise<Object>} Processed callback data
     */
    async handleCallback(callbackData) {
        const { Body } = callbackData;
        const stkCallback = Body?.stkCallback;

        if (!stkCallback) {
            throw new Error('Invalid M-Pesa callback format');
        }

        const { ResultCode, ResultDesc, CheckoutRequestID, MerchantRequestID, CallbackMetadata } = stkCallback;

        // Extract metadata items
        const metadata = {};
        if (CallbackMetadata?.Item) {
            CallbackMetadata.Item.forEach(item => {
                metadata[item.Name] = item.Value;
            });
        }

        return {
            event_type: ResultCode === 0 ? 'payment_succeeded' : 'payment_failed',
            checkout_request_id: CheckoutRequestID,
            merchant_request_id: MerchantRequestID,
            result_code: ResultCode,
            result_desc: ResultDesc,
            amount: metadata.Amount,
            mpesa_receipt_number: metadata.MpesaReceiptNumber,
            transaction_date: metadata.TransactionDate,
            phone_number: metadata.PhoneNumber,
            status: ResultCode === 0 ? 'succeeded' : 'failed'
        };
    }
}

module.exports = new MpesaGateway();
