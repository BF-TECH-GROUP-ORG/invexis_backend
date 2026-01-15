// src/controllers/transactionController.js
const transactionRepository = require('../repositories/transactionRepository');
const { successResponse, errorResponse } = require('../utils/responses');

class TransactionController {
    /**
     * Get seller transactions
     * GET /payment/transactions/seller/:seller_id
     */
    async getSellerTransactions(req, res) {
        try {
            const { seller_id } = req.params;
            const { limit, offset, status, type } = req.query;

            if (!seller_id) return errorResponse(res, 'Seller ID required', 400);

            const transactions = await transactionRepository.getTransactionsBySeller(seller_id, {
                limit: parseInt(limit) || 50,
                offset: parseInt(offset) || 0,
                status,
                type
            });

            return successResponse(res, transactions, 'Seller transactions retrieved');
        } catch (error) {
            console.error('Get seller transactions error:', error);
            return errorResponse(res, error.message, 500);
        }
    }

    /**
     * Get company transactions
     * GET /payment/transactions/company/:company_id
     */
    async getCompanyTransactions(req, res) {
        try {
            const { company_id } = req.params;
            const { limit, offset, status, type } = req.query;

            if (!company_id) return errorResponse(res, 'Company ID required', 400);

            const transactions = await transactionRepository.getTransactionsByCompany(company_id, {
                limit: parseInt(limit) || 50,
                offset: parseInt(offset) || 0,
                status,
                type
            });

            return successResponse(res, transactions, 'Company transactions retrieved');
        } catch (error) {
            console.error('Get company transactions error:', error);
            return errorResponse(res, error.message, 500);
        }
    }

    /**
     * Get shop transactions
     * GET /payment/transactions/shop/:shop_id
     */
    async getShopTransactions(req, res) {
        try {
            const { shop_id } = req.params;
            const { limit, offset, status, type } = req.query;

            if (!shop_id) return errorResponse(res, 'Shop ID required', 400);

            const transactions = await transactionRepository.getTransactionsByShop(shop_id, {
                limit: parseInt(limit) || 50,
                offset: parseInt(offset) || 0,
                status,
                type
            });

            return successResponse(res, transactions, 'Shop transactions retrieved');
        } catch (error) {
            console.error('Get shop transactions error:', error);
            return errorResponse(res, error.message, 500);
        }
    }
}

module.exports = new TransactionController();
