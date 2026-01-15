// src/controllers/reportingController.js
const reportingRepository = require('../repositories/reportingRepository');
const { successResponse, errorResponse } = require('../utils/responses');

class ReportingController {

    /**
     * Get seller monthly totals (keeping existing logic or moving to repo?)
     * For now, we'll keep the specific MV query here or move if time permits, 
     * but prioritizing the user's main analytics request.
     * Let's use the new system for the main stats.
     */
    async getSellerMonthlyTotals(req, res) {
        // Keeping as is for now to avoid regression on specific materialized view usage if unrelated
        // ... (This function remains unchanged as it queries a specific MV)
        // For brevity in this edit, assuming we keep it or refactor it later.
        // Actually, let's keep it safe.
        // But for the NEW rich requests, we use the repo.
        try {
            const { seller_id } = req.params;
            // ... (original logic)
            // Note: In a full refactor, this would go to repo too.
            const { db } = require('../config/db');
            const { year, month } = req.query;
            if (!seller_id) return errorResponse(res, 'Seller ID required', 400);

            let query = db('mv_seller_monthly_totals').where({ seller_id });
            if (year) query = query.where('year', parseInt(year));
            if (month) query = query.where('month', parseInt(month));
            const totals = await query.orderBy('year', 'desc').orderBy('month', 'desc');
            return successResponse(res, totals, 'Seller monthly totals retrieved');
        } catch (error) {
            return errorResponse(res, error.message, 500);
        }
    }

    /**
     * Get payment statistics (Generic / Seller / Admin)
     */
    async getPaymentStats(req, res) {
        try {
            const { seller_id, start_date, end_date } = req.query;
            const stats = await reportingRepository.getAnalytics({ seller_id, start_date, end_date });
            return successResponse(res, stats, 'Payment statistics retrieved');
        } catch (error) {
            console.error('Get payment stats error:', error);
            return errorResponse(res, error.message, 500);
        }
    }

    /**
     * Get shop analytics
     * GET /payment/reports/shop/:shop_id/analytics
     */
    async getShopAnalytics(req, res) {
        try {
            const { shop_id } = req.params;
            const { start_date, end_date } = req.query;

            if (!shop_id) return errorResponse(res, 'Shop ID required', 400);

            const analytics = await reportingRepository.getAnalytics({ shop_id, start_date, end_date });
            return successResponse(res, analytics, 'Shop analytics retrieved');
        } catch (error) {
            console.error('Get shop analytics error:', error);
            return errorResponse(res, error.message, 500);
        }
    }

    /**
     * Get company analytics
     * GET /payment/reports/company/:company_id/analytics
     */
    async getCompanyAnalytics(req, res) {
        try {
            const { company_id } = req.params;
            const { start_date, end_date } = req.query;

            if (!company_id) return errorResponse(res, 'Company ID required', 400);

            const analytics = await reportingRepository.getAnalytics({ company_id, start_date, end_date });
            return successResponse(res, analytics, 'Company analytics retrieved');
        } catch (error) {
            console.error('Get company analytics error:', error);
            return errorResponse(res, error.message, 500);
        }
    }

    /**
     * Get payment trends
     */
    async getPaymentTrends(req, res) {
        try {
            const { seller_id, shop_id, company_id, period, limit } = req.query;
            const trends = await reportingRepository.getTrends({ seller_id, shop_id, company_id }, period, limit);
            return successResponse(res, trends, 'Payment trends retrieved');
        } catch (error) {
            console.error('Get payment trends error:', error);
            return errorResponse(res, error.message, 500);
        }
    }

    /**
     * Get top products
     */
    async getTopProducts(req, res) {
        try {
            const { seller_id, shop_id, company_id, limit } = req.query;
            const products = await reportingRepository.getTopProducts({ seller_id, shop_id, company_id }, limit);
            return successResponse(res, products, 'Top products retrieved');
        } catch (error) {
            console.error('Get top products error:', error);
            return errorResponse(res, error.message, 500);
        }
    }

    /**
     * Get gateway performance
     */
    async getGatewayPerformance(req, res) {
        try {
            const { start_date, end_date } = req.query;
            const performance = await reportingRepository.getGatewayPerformance({ start_date, end_date });
            return successResponse(res, performance, 'Gateway performance retrieved');
        } catch (error) {
            console.error('Get gateway performance error:', error);
            return errorResponse(res, error.message, 500);
        }
    }

    /**
     * [PLATFORM] Get System Overview
     */
    async getPlatformOverview(req, res) {
        try {
            const { start_date, end_date } = req.query;
            const overview = await reportingRepository.getPlatformOverview({ start_date, end_date });
            return successResponse(res, overview, 'Platform overview retrieved');
        } catch (error) {
            console.error('Get platform overview error:', error);
            return errorResponse(res, error.message, 500);
        }
    }

    /**
     * [PLATFORM] Get Top Companies
     */
    async getPlatformTopCompanies(req, res) {
        try {
            const { limit } = req.query;
            const companies = await reportingRepository.getPlatformTopCompanies(limit);
            return successResponse(res, companies, 'Top companies retrieved');
        } catch (error) {
            console.error('Get top companies error:', error);
            return errorResponse(res, error.message, 500);
        }
    }

    /**
     * [CHARTS] Get Dashboard Charts Data
     * Supports ?company_id= or ?shop_id=
     */
    async getDashboardCharts(req, res) {
        try {
            const { company_id, shop_id, seller_id, period } = req.query;
            const chartData = await reportingRepository.getChartData({
                company_id, shop_id, seller_id, period
            });
            return successResponse(res, chartData, 'Dashboard charts retrieved');
        } catch (error) {
            console.error('Get dashboard charts error:', error);
            return errorResponse(res, error.message, 500);
        }
    }

    /**
     * Get payout history (Remaining legacy logic for now)
     */
    async getPayoutHistory(req, res) {
        try {
            // ... legacy database access for payouts specifically ...
            // For brevity, using the same logic as before but importing db if needed
            const { db } = require('../config/db');
            const { seller_id, status } = req.query;
            if (!seller_id) return errorResponse(res, 'Seller ID required', 400);
            let query = db('payments').select('payment_id', 'created_at', 'amount', 'currency', 'payout_recipient_id', 'payout_details', 'payout_status').where({ seller_id }).whereNotNull('payout_recipient_id').orderBy('created_at', 'desc');
            if (status) query = query.where({ payout_status: status });
            const payouts = await query;
            return successResponse(res, payouts, 'Payout history retrieved');
        } catch (error) {
            return errorResponse(res, error.message, 500);
        }
    }

    /**
     * Export transaction history (Keep existing export logic)
     */
    async exportTransactionHistory(req, res) {
        // ... (Keep existing implementation as it does specific CSV formatting)
        // Ideally moved to a service, but controller is okay for now for stream handling
        const { db } = require('../config/db');
        try {
            const { seller_id, start_date, end_date, format = 'csv' } = req.query;
            const { Parser } = require('json2csv');

            if (!seller_id) return errorResponse(res, 'Seller ID required', 400);

            let query = db('payments').select('payment_id', 'created_at', 'amount', 'currency', 'status', 'method', 'gateway', 'description', 'customer_email', 'shop_id', 'payout_status').where({ seller_id }).orderBy('created_at', 'desc');
            if (start_date) query = query.where('created_at', '>=', start_date);
            if (end_date) query = query.where('created_at', '<=', end_date);
            const transactions = await query;

            if (format === 'csv') {
                const fields = ['payment_id', 'created_at', 'amount', 'currency', 'status', 'method', 'gateway', 'description', 'customer_email', 'shop_id', 'payout_status'];
                const json2csvParser = new Parser({ fields });
                const csv = json2csvParser.parse(transactions);
                res.header('Content-Type', 'text/csv');
                res.attachment(`transactions-${seller_id}-${new Date().toISOString()}.csv`);
                return res.send(csv);
            } else {
                return successResponse(res, transactions, 'Transaction history retrieved');
            }
        } catch (error) {
            console.error('Export transaction history error:', error);
            return errorResponse(res, error.message, 500);
        }
    }
    /**
     * Get detailed revenue summary (Company Total + Shop Breakdown)
     * GET /reports/revenue-summary?company_id=...
     */
    async getRevenueSummary(req, res) {
        try {
            const { company_id, start_date, end_date } = req.query;

            if (!company_id) return errorResponse(res, 'Company ID required', 400);

            const summary = await reportingRepository.getCompanyShopBreakdown(company_id, { start_date, end_date });
            return successResponse(res, summary, 'Revenue summary retrieved');
        } catch (error) {
            console.error('Get revenue summary error:', error);
            return errorResponse(res, error.message, 500);
        }
    }
}

module.exports = new ReportingController();
