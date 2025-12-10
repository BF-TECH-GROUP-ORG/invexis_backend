// src/services/paymentService.js
// Main payment service orchestrating all gateways and database operations

require('dotenv').config();
const paymentRepository = require('../repositories/paymentRepository');
const transactionRepository = require('../repositories/transactionRepository');
const invoiceService = require('./invoiceService');
const stripeGateway = require('./gateways/stripeGateway');
const mtnMomoGateway = require('./gateways/mtnMomoGateway');
const airtelMoneyGateway = require('./gateways/airtelMoneyGateway');
const mpesaGateway = require('./gateways/mpesaGateway');
const { publishPaymentEvent } = require('../events/producer');
const { GATEWAY_TYPES, PAYMENT_STATUS, TRANSACTION_TYPE, TRANSACTION_STATUS } = require('../utils/constants');

// Optional: Redis for caching
let redis;
try {
    redis = require('/app/shared/redis');
} catch (error) {
    console.warn('Shared services (Redis) not available, continuing without it');
    redis = null;
}

class PaymentService {
    /**
     * Initiate a payment
     * @param {Object} paymentData - Payment information
     * @returns {Promise<Object>} Payment result
     */
    async initiatePayment(paymentData) {
        const {
            user_id,
            seller_id,
            company_id,
            shop_id,
            order_id,
            payout_recipient_id,
            payout_details,
            amount,
            currency,
            description,
            method,
            gateway,
            phoneNumber,
            customer_email,
            line_items,
            metadata,
            ip,
            device_fingerprint,
            location
        } = paymentData;

        // Validate gateway
        if (!Object.values(GATEWAY_TYPES).includes(gateway)) {
            throw new Error(`Unsupported gateway: ${gateway}`);
        }

        try {
            // Create payment record in database
            const payment = await paymentRepository.createPayment({
                user_id,
                seller_id,
                company_id,
                shop_id,
                order_id,
                payout_recipient_id,
                payout_details,
                company_id,
                order_id,
                amount,
                currency,
                description,
                method,
                gateway,
                customer_email,
                line_items,
                metadata,
                ip,
                device_fingerprint,
                location
            });

            // Create initial transaction record
            const transaction = await transactionRepository.createTransaction({
                payment_id: payment.payment_id,
                user_id,
                seller_id,
                company_id,
                type: TRANSACTION_TYPE.CHARGE,
                amount,
                currency,
                status: TRANSACTION_STATUS.PENDING,
                metadata: { gateway, initial_request: true }
            });

            // Initiate payment with appropriate gateway
            let gatewayResult;
            let gateway_token;

            switch (gateway) {
                case GATEWAY_TYPES.STRIPE:
                    gatewayResult = await stripeGateway.createPaymentIntent({
                        amount,
                        currency,
                        description,
                        metadata,
                        customer_email
                    });
                    gateway_token = gatewayResult.payment_intent_id;
                    break;

                case GATEWAY_TYPES.MTN_MOMO:
                    gatewayResult = await mtnMomoGateway.initiatePayment({
                        amount,
                        currency,
                        phoneNumber,
                        description,
                        metadata
                    });
                    gateway_token = gatewayResult.reference_id;
                    break;

                case GATEWAY_TYPES.AIRTEL_MONEY:
                    gatewayResult = await airtelMoneyGateway.initiatePayment({
                        amount,
                        currency,
                        phoneNumber,
                        description,
                        metadata
                    });
                    gateway_token = gatewayResult.reference_id;
                    break;

                case GATEWAY_TYPES.MPESA:
                    gatewayResult = await mpesaGateway.initiatePayment({
                        amount,
                        phoneNumber,
                        description,
                        metadata
                    });
                    gateway_token = gatewayResult.checkout_request_id;
                    break;

                default:
                    throw new Error(`Gateway ${gateway} not implemented`);
            }

            // Update payment with gateway token
            await paymentRepository.updatePaymentStatus(payment.payment_id, {
                status: PAYMENT_STATUS.PROCESSING,
                gateway_token,
                metadata: { ...metadata, gateway_response: gatewayResult }
            });

            // Update transaction status
            await transactionRepository.updateTransactionStatus(transaction.transaction_id, {
                status: TRANSACTION_STATUS.PENDING,
                gateway_transaction_id: gateway_token,
                metadata: { gateway_response: gatewayResult }
            });

            // Publish event
            await publishPaymentEvent.processed({
                id: payment.payment_id,
                amount,
                currency,
                status: PAYMENT_STATUS.PROCESSING,
                order_id,
                metadata,
            });

            return {
                success: true,
                payment_id: payment.payment_id,
                transaction_id: transaction.transaction_id,
                gateway_token,
                status: PAYMENT_STATUS.PROCESSING,
                gateway_response: gatewayResult,
                message: 'Payment initiated successfully'
            };

        } catch (error) {
            console.error('Payment initiation error:', error.message);

            // Publish failure event (if RabbitMQ available)
            // Publish failure event
            await publishPaymentEvent.failed({
                id: payment ? payment.payment_id : 'unknown',
                amount,
                order_id,
            }, error.message);

            throw error;
        }
    }

    /**
     * Check payment status
     * @param {string} payment_id - Payment UUID
     * @returns {Promise<Object>} Payment status
     */
    async checkPaymentStatus(payment_id) {
        const payment = await paymentRepository.getPaymentById(payment_id);

        if (!payment) {
            throw new Error('Payment not found');
        }

        // If payment is already in final state, return it
        if ([PAYMENT_STATUS.SUCCEEDED, PAYMENT_STATUS.FAILED, PAYMENT_STATUS.CANCELLED].includes(payment.status)) {
            return {
                payment_id: payment.payment_id,
                status: payment.status,
                amount: payment.amount,
                currency: payment.currency,
                gateway: payment.gateway,
                processed_at: payment.processed_at
            };
        }

        // Query gateway for latest status
        try {
            let gatewayStatus;

            switch (payment.gateway) {
                case GATEWAY_TYPES.STRIPE:
                    gatewayStatus = await stripeGateway.getPaymentStatus(payment.gateway_token);
                    break;

                case GATEWAY_TYPES.MTN_MOMO:
                    gatewayStatus = await mtnMomoGateway.checkPaymentStatus(payment.gateway_token);
                    break;

                case GATEWAY_TYPES.AIRTEL_MONEY:
                    gatewayStatus = await airtelMoneyGateway.checkPaymentStatus(payment.gateway_token);
                    break;

                case GATEWAY_TYPES.MPESA:
                    gatewayStatus = await mpesaGateway.checkPaymentStatus(payment.gateway_token);
                    break;

                default:
                    throw new Error(`Gateway ${payment.gateway} not supported`);
            }

            // Update payment status based on gateway response
            const newStatus = this.mapGatewayStatus(gatewayStatus.status, payment.gateway);

            if (newStatus !== payment.status) {
                await paymentRepository.updatePaymentStatus(payment_id, {
                    status: newStatus,
                    metadata: { ...payment.metadata, latest_gateway_status: gatewayStatus }
                });

                // If payment succeeded, generate invoice
                if (newStatus === PAYMENT_STATUS.SUCCEEDED) {
                    await this.handleSuccessfulPayment(payment);
                }
            }

            return {
                payment_id: payment.payment_id,
                status: newStatus,
                amount: payment.amount,
                currency: payment.currency,
                gateway: payment.gateway,
                gateway_status: gatewayStatus
            };

        } catch (error) {
            console.error('Error checking payment status:', error.message);
            throw error;
        }
    }

    /**
     * Handle successful payment
     * @param {Object} payment - Payment record
     */
    async handleSuccessfulPayment(payment) {
        try {
            // Generate invoice
            const invoice = await invoiceService.generateInvoice({
                payment_id: payment.payment_id,
                user_id: payment.user_id,
                seller_id: payment.seller_id,
                company_id: payment.company_id,
                amount: payment.amount,
                currency: payment.currency,
                description: payment.description,
                metadata: payment.metadata
            }, payment.metadata?.line_items || []);

            // Generate PDF
            await invoiceService.generatePDF(invoice.invoice_id);

            // Mark invoice as paid
            await invoiceService.markAsPaid(invoice.invoice_id);

            // Event publishing handled via payment status updates or specific flows
            // If needed, we can add publishPaymentEvent.succeeded() here later

        } catch (error) {
            console.error('Error handling successful payment:', error.message);
        }
    }

    /**
     * Map gateway-specific status to standard payment status
     * @param {string} gatewayStatus - Gateway status
     * @param {string} gateway - Gateway type
     * @returns {string} Standard payment status
     */
    mapGatewayStatus(gatewayStatus, gateway) {
        const statusMap = {
            [GATEWAY_TYPES.STRIPE]: {
                'succeeded': PAYMENT_STATUS.SUCCEEDED,
                'processing': PAYMENT_STATUS.PROCESSING,
                'requires_payment_method': PAYMENT_STATUS.PENDING,
                'requires_confirmation': PAYMENT_STATUS.PENDING,
                'requires_action': PAYMENT_STATUS.PENDING,
                'canceled': PAYMENT_STATUS.CANCELLED,
                'failed': PAYMENT_STATUS.FAILED
            },
            [GATEWAY_TYPES.MTN_MOMO]: {
                'successful': PAYMENT_STATUS.SUCCEEDED,
                'pending': PAYMENT_STATUS.PROCESSING,
                'failed': PAYMENT_STATUS.FAILED
            },
            [GATEWAY_TYPES.AIRTEL_MONEY]: {
                'ts': PAYMENT_STATUS.SUCCEEDED,
                'pending': PAYMENT_STATUS.PROCESSING,
                'failed': PAYMENT_STATUS.FAILED
            },
            [GATEWAY_TYPES.MPESA]: {
                'succeeded': PAYMENT_STATUS.SUCCEEDED,
                'pending': PAYMENT_STATUS.PROCESSING,
                'failed': PAYMENT_STATUS.FAILED
            }
        };

        return statusMap[gateway]?.[gatewayStatus.toLowerCase()] || PAYMENT_STATUS.PROCESSING;
    }

    /**
     * Cancel a payment
     * @param {string} payment_id - Payment UUID
     * @param {string} reason - Cancellation reason
     * @returns {Promise<Object>} Updated payment
     */
    async cancelPayment(payment_id, reason) {
        const payment = await paymentRepository.getPaymentById(payment_id);

        if (!payment) {
            throw new Error('Payment not found');
        }

        if (payment.status !== PAYMENT_STATUS.PENDING && payment.status !== PAYMENT_STATUS.PROCESSING) {
            throw new Error(`Cannot cancel payment with status: ${payment.status}`);
        }

        return await paymentRepository.updatePaymentStatus(payment_id, {
            status: PAYMENT_STATUS.CANCELLED,
            cancellation_reason: reason
        });
    }

    /**
     * Get user payments
     * @param {string} user_id - User UUID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} List of payments
     */
    async getUserPayments(user_id, options = {}) {
        return await paymentRepository.getPaymentsByUser(user_id, options);
    }

    /**
     * Get seller payments
     * @param {string} seller_id - Seller UUID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} List of payments
     */
    async getSellerPayments(seller_id, options = {}) {
        return await paymentRepository.getPaymentsBySeller(seller_id, options);
    }
}

module.exports = new PaymentService();
