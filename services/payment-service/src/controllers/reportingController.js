// src/controllers/reportingController.js
// Reporting controller for analytics and statistics

const { db } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/responses');

class ReportingController {
    /**
     * Get seller monthly totals
     * GET /payment/reports/seller/:seller_id/monthly
     */
    async getSellerMonthlyTotals(req, res) {
        try {
            const { seller_id } = req.params;
            const { year, month } = req.query;

            if (!seller_id) {
                return errorResponse(res, 'Seller ID required', 400);
            }

            let query = db('mv_seller_monthly_totals')
                .where({ seller_id });

            if (year) {
                query = query.where('year', parseInt(year));
            }

            if (month) {
                query = query.where('month', parseInt(month));
            }

            const totals = await query.orderBy('year', 'desc').orderBy('month', 'desc');

            return successResponse(res, totals, 'Seller monthly totals retrieved');

        } catch (error) {
            console.error('Get seller monthly totals error:', error);
            return errorResponse(res, error.message, 500);
        }
    }

    /**
     * Get payment statistics
     * GET /payment/reports/stats
     */
    async getPaymentStats(req, res) {
        try {
            const { seller_id, start_date, end_date } = req.query;

            let query = db('payments')
                .select(
                    db.raw('COUNT(*) as total_payments'),
                    db.raw('COUNT(*) FILTER (WHERE status = ?) as successful_payments', ['succeeded']),
                    db.raw('COUNT(*) FILTER (WHERE status = ?) as failed_payments', ['failed']),
                    db.raw('COUNT(*) FILTER (WHERE status = ?) as pending_payments', ['pending']),
                    db.raw('SUM(amount) FILTER (WHERE status = ?) as total_revenue', ['succeeded']),
                    db.raw('AVG(amount) FILTER (WHERE status = ?) as average_payment', ['succeeded'])
                );

            if (seller_id) {
                query = query.where({ seller_id });
            }

            if (start_date) {
                query = query.where('created_at', '>=', start_date);
            }

            if (end_date) {
                query = query.where('created_at', '<=', end_date);
            }

            const stats = await query.first();

            return successResponse(res, stats, 'Payment statistics retrieved');

        } catch (error) {
            console.error('Get payment stats error:', error);
            return errorResponse(res, error.message, 500);
        }
    }

    /**
     * Get gateway performance
     * GET /payment/reports/gateway-performance
     */
    async getGatewayPerformance(req, res) {
        try {
            const { start_date, end_date } = req.query;

            let query = db('payments')
                .select(
                    'gateway',
                    db.raw('COUNT(*) as total_payments'),
                    db.raw('COUNT(*) FILTER (WHERE status = ?) as successful_payments', ['succeeded']),
                    db.raw('COUNT(*) FILTER (WHERE status = ?) as failed_payments', ['failed']),
                    db.raw('ROUND(COUNT(*) FILTER (WHERE status = ?)::numeric / COUNT(*)::numeric * 100, 2) as success_rate', ['succeeded']),
                    db.raw('SUM(amount) FILTER (WHERE status = ?) as total_revenue', ['succeeded'])
                )
                .groupBy('gateway');

            if (start_date) {
                query = query.where('created_at', '>=', start_date);
            }

            if (end_date) {
                query = query.where('created_at', '<=', end_date);
            }

            const performance = await query;

            return successResponse(res, performance, 'Gateway performance retrieved');

        } catch (error) {
            console.error('Get gateway performance error:', error);
            return errorResponse(res, error.message, 500);
        }
    }

    /**
     * Get payment trends
     * GET /payment/reports/trends
     */
    async getPaymentTrends(req, res) {
        try {
            const { seller_id, period = 'daily', limit = 30 } = req.query;

            let dateFormat;
            switch (period) {
                case 'hourly':
                    dateFormat = 'YYYY-MM-DD HH24:00:00';
                    break;
                case 'daily':
                    dateFormat = 'YYYY-MM-DD';
                    break;
                case 'weekly':
                    dateFormat = 'IYYY-IW';
                    break;
                case 'monthly':
                    dateFormat = 'YYYY-MM';
                    break;
                default:
                    dateFormat = 'YYYY-MM-DD';
            }

            let query = db('payments')
                .select(
                    db.raw(`TO_CHAR(created_at, ?) as period`, [dateFormat]),
                    db.raw('COUNT(*) as total_payments'),
                    db.raw('COUNT(*) FILTER (WHERE status = ?) as successful_payments', ['succeeded']),
                    db.raw('SUM(amount) FILTER (WHERE status = ?) as total_revenue', ['succeeded'])
                )
                .groupBy(db.raw(`TO_CHAR(created_at, ?)`, [dateFormat]))
                .orderBy(db.raw(`TO_CHAR(created_at, ?)`, [dateFormat]), 'desc')
                .limit(parseInt(limit));

            if (seller_id) {
                query = query.where({ seller_id });
            }

            const trends = await query;

            return successResponse(res, trends, 'Payment trends retrieved');

        } catch (error) {
            console.error('Get payment trends error:', error);
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

            if (!shop_id) {
                return errorResponse(res, 'Shop ID required', 400);
            }

            let query = db('payments')
                .select(
                    db.raw('COUNT(*) as total_orders'),
                    db.raw('COUNT(*) FILTER (WHERE status = ?) as successful_orders', ['succeeded']),
                    db.raw('SUM(amount) FILTER (WHERE status = ?) as total_revenue', ['succeeded']),
                    db.raw('AVG(amount) FILTER (WHERE status = ?) as average_order_value', ['succeeded']),
                    db.raw('COUNT(*) FILTER (WHERE status = ?) as pending_orders', ['pending']),
                    db.raw('COUNT(*) FILTER (WHERE status = ?) as failed_orders', ['failed'])
                )
                .where({ shop_id });

            if (start_date) {
                query = query.where('created_at', '>=', start_date);
            }

            if (end_date) {
                query = query.where('created_at', '<=', end_date);
            }

            const analytics = await query.first();

            // Calculate success rate
            const total = parseInt(analytics.total_orders);
            const successful = parseInt(analytics.successful_orders);
            analytics.success_rate = total > 0 ? ((successful / total) * 100).toFixed(2) : 0;

            return successResponse(res, analytics, 'Shop analytics retrieved');

        } catch (error) {
            console.error('Get shop analytics error:', error);
            return errorResponse(res, error.message, 500);
        }
    }

    /**
     * Get top selling products
     * GET /payment/reports/top-products
     */
    async getTopProducts(req, res) {
        try {
            const { seller_id, limit = 10 } = req.query;

            if (!seller_id) {
                return errorResponse(res, 'Seller ID required', 400);
            }

            // Note: This assumes line_items is a JSONB column
            const topProducts = await db('payments')
                .select(
                    db.raw("line_items->0->>'name' as product_name"), // Simplified for single item, ideally use lateral join
                    db.raw("COUNT(*) as sales_count"),
                    db.raw("SUM(amount) as total_revenue")
                )
                .where({ seller_id, status: 'succeeded' })
                .groupBy(db.raw("line_items->0->>'name'"))
                .orderBy('total_revenue', 'desc')
                .limit(parseInt(limit));

            return successResponse(res, topProducts, 'Top products retrieved');

        } catch (error) {
            console.error('Get top products error:', error);
            return errorResponse(res, error.message, 500);
        }
    }

    /**
     * Get payout history
     * GET /payment/reports/payouts
     */
    async getPayoutHistory(req, res) {
        try {
            const { seller_id, status } = req.query;

            if (!seller_id) {
                return errorResponse(res, 'Seller ID required', 400);
            }

            let query = db('payments')
                .select(
                    'payment_id',
                    'created_at',
                    'amount',
                    'currency',
                    'payout_recipient_id',
                    'payout_details',
                    'payout_status'
                )
                .where({ seller_id })
                .whereNotNull('payout_recipient_id')
                .orderBy('created_at', 'desc');

            if (status) {
                query = query.where({ payout_status: status });
            }

            const payouts = await query;

            return successResponse(res, payouts, 'Payout history retrieved');

        } catch (error) {
            console.error('Get payout history error:', error);
            return errorResponse(res, error.message, 500);
        }
    }

    /**
     * Export transaction history
     * GET /payment/reports/export/transactions
     */
    async exportTransactionHistory(req, res) {
        try {
            const { seller_id, start_date, end_date, format = 'csv' } = req.query;
            const { Parser } = require('json2csv');

            if (!seller_id) {
                return errorResponse(res, 'Seller ID required', 400);
            }

            let query = db('payments')
                .select(
                    'payment_id',
                    'created_at',
                    'amount',
                    'currency',
                    'status',
                    'method',
                    'gateway',
                    'description',
                    'customer_email',
                    'shop_id',
                    'payout_status'
                )
                .where({ seller_id })
                .orderBy('created_at', 'desc');

            if (start_date) {
                query = query.where('created_at', '>=', start_date);
            }

            if (end_date) {
                query = query.where('created_at', '<=', end_date);
            }

            const transactions = await query;

            if (format === 'csv') {
                const fields = [
                    'payment_id',
                    'created_at',
                    'amount',
                    'currency',
                    'status',
                    'method',
                    'gateway',
                    'description',
                    'customer_email',
                    'shop_id',
                    'payout_status'
                ];
                const json2csvParser = new Parser({ fields });
                const csv = json2csvParser.parse(transactions);

                res.header('Content-Type', 'text/csv');
                res.attachment(`transactions-${seller_id}-${new Date().toISOString()}.csv`);
                return res.send(csv);
            } else {
                // Default to JSON if not CSV
                return successResponse(res, transactions, 'Transaction history retrieved');
            }

        } catch (error) {
            console.error('Export transaction history error:', error);
            return errorResponse(res, error.message, 500);
        }
    }
}

module.exports = new ReportingController();
