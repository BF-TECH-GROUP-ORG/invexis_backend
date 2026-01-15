// src/controllers/paymentController.js
// Payment controller handling all payment-related endpoints

const paymentService = require('../services/paymentService');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responses');
const { validate, paymentInitiationSchema } = require('../utils/validators');

class PaymentController {
    /**
     * Initiate a new payment
     * POST /payment/initiate
     */
    async initiatePayment(req, res) {
        try {
            // 1. Validate request body
            const { error, value } = validate(paymentInitiationSchema, req.body);
            if (error) {
                return errorResponse(res, `Validation error: ${error.message} `, 400);
            }

            // 2. Enrich with context (Optional metadata for security or tracking)
            const paymentData = {
                ...req.body
            };

            // 3. Delegate to service (where smart normalization happens)
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

            const { data, total } = await paymentService.getSellerPayments(seller_id, {
                limit: parseInt(limit) || 50,
                offset: parseInt(offset) || 0,
                status
            });

            return paginatedResponse(res, data, {
                total,
                limit: parseInt(limit) || 50,
                offset: parseInt(offset) || 0
            }, 'Seller payments retrieved');

        } catch (error) {
            console.error('Get seller payments error:', error);
            return errorResponse(res, error.message, 500);
        }
    }

    /**
     * Get company payments
     * GET /payment/company/:company_id
     */
    async getCompanyPayments(req, res) {
        try {
            const { company_id } = req.params;
            const { limit, offset, status } = req.query;

            if (!company_id) {
                return errorResponse(res, 'Company ID required', 400);
            }

            const { data, total } = await paymentService.getCompanyPayments(company_id, {
                limit: parseInt(limit) || 50,
                offset: parseInt(offset) || 0,
                status
            });

            return paginatedResponse(res, data, {
                total,
                limit: parseInt(limit) || 50,
                offset: parseInt(offset) || 0
            }, 'Company payments retrieved');

        } catch (error) {
            console.error('Get company payments error:', error);
            return errorResponse(res, error.message, 500);
        }
    }

    /**
     * Get shop payments
     * GET /payment/shop/:shop_id
     */
    async getShopPayments(req, res) {
        try {
            const { shop_id } = req.params;
            const { limit, offset, status } = req.query;

            if (!shop_id) {
                return errorResponse(res, 'Shop ID required', 400);
            }

            const { data, total } = await paymentService.getShopPayments(shop_id, {
                limit: parseInt(limit) || 50,
                offset: parseInt(offset) || 0,
                status
            });

            return paginatedResponse(res, data, {
                total,
                limit: parseInt(limit) || 50,
                offset: parseInt(offset) || 0
            }, 'Shop payments retrieved');

        } catch (error) {
            console.error('Get shop payments error:', error);
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

    /**
     * Get all company settings
     * GET /payment/settings/all
     */
    async getAllSettings(req, res) {
        try {
            const result = await paymentService.getAllSettings();
            return successResponse(res, result, 'All company settings retrieved');
        } catch (error) {
            console.error('Get all settings error:', error);
            return errorResponse(res, error.message, 500);
        }
    }
}

module.exports = new PaymentController();
