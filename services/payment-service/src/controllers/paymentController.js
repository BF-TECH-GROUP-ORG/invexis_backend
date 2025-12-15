// src/controllers/paymentController.js
// Payment controller handling all payment-related endpoints

const paymentService = require('../services/paymentService');
const { successResponse, errorResponse } = require('../utils/responses');
const { validate, paymentInitiationSchema } = require('../utils/validators');

class PaymentController {
    /**
     * Initiate a new payment
     * POST /payment/initiate
     */
    async initiatePayment(req, res) {
        try {
            // Validate request body
            const { error, value } = validate(paymentInitiationSchema, req.body);
            if (error) {
                return errorResponse(res, `Validation error: ${error.message} `, 400);
            }

            // Extract user from auth middleware (if available)
            const user_id = req.user?.id || req.body.user_id;
            if (!user_id) {
                return errorResponse(res, 'User ID required', 400);
            }

            const paymentData = {
                user_id,
                seller_id: req.body.seller_id,
                company_id: req.body.company_id,
                shop_id: req.body.shop_id,
                order_id: req.body.order_id,
                payout_recipient_id: req.body.payout_recipient_id,
                payout_details: req.body.payout_details,
                amount: req.body.amount,
                currency: req.body.currency,
                description: req.body.description,
                method: req.body.paymentMethod,
                gateway: req.body.gateway,
                phoneNumber: req.body.phoneNumber,
                customer_email: req.body.customerEmail,
                line_items: req.body.lineItems,
                metadata: req.body.metadata,
                ip: req.ip,
                device_fingerprint: req.headers['x-device-fingerprint'],
                location: req.body.location
            };

            const result = await paymentService.initiatePayment(paymentData);

            return successResponse(res, result, 'Payment initiated successfully');

        } catch (error) {
            console.error('Initiate payment error:', error);
            return errorResponse(res, error.message, 500);
        }
    }

    /**
     * Get payment status
     * GET /payment/status/:payment_id
     */
    async getPaymentStatus(req, res) {
        try {
            const { payment_id } = req.params;

            if (!payment_id) {
                return errorResponse(res, 'Payment ID required', 400);
            }

            const result = await paymentService.checkPaymentStatus(payment_id);

            return successResponse(res, result, 'Payment status retrieved');

        } catch (error) {
            console.error('Get payment status error:', error);
            return errorResponse(res, error.message, 500);
        }
    }

    /**
     * Get user payments
     * GET /payment/user/:user_id
     */
    async getUserPayments(req, res) {
        try {
            const { user_id } = req.params;
            const { limit, offset, status } = req.query;

            if (!user_id) {
                return errorResponse(res, 'User ID required', 400);
            }

            const payments = await paymentService.getUserPayments(user_id, {
                limit: parseInt(limit) || 50,
                offset: parseInt(offset) || 0,
                status
            });

            return successResponse(res, payments, 'User payments retrieved');

        } catch (error) {
            console.error('Get user payments error:', error);
            return errorResponse(res, error.message, 500);
        }
    }

    /**
     * Get seller payments
     * GET /payment/seller/:seller_id
     */
    async getSellerPayments(req, res) {
        try {
            const { seller_id } = req.params;
            const { limit, offset, status } = req.query;

            if (!seller_id) {
                return errorResponse(res, 'Seller ID required', 400);
            }

            const payments = await paymentService.getSellerPayments(seller_id, {
                limit: parseInt(limit) || 50,
                offset: parseInt(offset) || 0,
                status
            });

            return successResponse(res, payments, 'Seller payments retrieved');

        } catch (error) {
            console.error('Get seller payments error:', error);
            return errorResponse(res, error.message, 500);
        }
    }

    /**
     * Cancel a payment
     * POST /payment/cancel/:payment_id
     */
    async cancelPayment(req, res) {
        try {
            const { payment_id } = req.params;
            const { reason } = req.body;

            if (!payment_id) {
                return errorResponse(res, 'Payment ID required', 400);
            }

            const result = await paymentService.cancelPayment(payment_id, reason || 'User cancelled');

            return successResponse(res, result, 'Payment cancelled');

        } catch (error) {
            console.error('Cancel payment error:', error);
            return errorResponse(res, error.message, 500);
        }
    }
}

module.exports = new PaymentController();
