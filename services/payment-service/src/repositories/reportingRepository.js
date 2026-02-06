// src/repositories/reportingRepository.js
// Centralized database queries for analytics and content reporting

const { db } = require('../config/db');

class ReportingRepository {
    /**
     * Get aggregated analytics (revenue, counts, success rate)
     * Supports filtering by seller_id, company_id, or shop_id
     */
    async getAnalytics(filters = {}) {
        const { seller_id, company_id, shop_id, start_date, end_date } = filters;

        // Base Query
        let query = db('payments')
            .select(
                db.raw('COUNT(*) as total_orders'),
                db.raw('COUNT(*) FILTER (WHERE status = ?) as successful_orders', ['succeeded']),
                db.raw('COALESCE(SUM(amount) FILTER (WHERE status = ?), 0) as total_revenue', ['succeeded']),
                db.raw('COALESCE(AVG(amount) FILTER (WHERE status = ?), 0) as average_order_value', ['succeeded']),
                db.raw('COUNT(*) FILTER (WHERE status = ?) as pending_orders', ['pending']),
                db.raw('COUNT(*) FILTER (WHERE status = ?) as failed_orders', ['failed'])
            );

        // Apply Filters
        if (seller_id) query = query.where({ seller_id });
        if (company_id) query = query.where({ company_id });
        if (shop_id) query = query.where({ shop_id });

        if (start_date) query = query.where('created_at', '>=', start_date);
        if (end_date) query = query.where('created_at', '<=', end_date);

        const result = await query.first();

        // Calculate Derived Metrics
        const totalCount = parseInt(result.total_orders);
        const successfulCount = parseInt(result.successful_orders);
        const failedCount = parseInt(result.failed_orders);

        result.success_rate = totalCount > 0 ? ((successfulCount / totalCount) * 100).toFixed(2) : 0;
        result.failure_rate = totalCount > 0 ? ((failedCount / totalCount) * 100).toFixed(2) : 0;
        result.average_order_value = parseFloat(result.average_order_value).toFixed(2);

        // Add gross volume (everything including pending/failed)
        const grossResult = await query.clone().select(db.raw('COALESCE(SUM(amount), 0) as gross_volume')).first();
        result.gross_volume = grossResult.gross_volume;

        return result;
    }

    /**
     * Get payment trends over time (daily, weekly, monthly)
     */
    async getTrends(filters = {}, period = 'daily', limit = 30) {
        const { seller_id, company_id, shop_id } = filters;

        let dateFormat;
        switch (period) {
            case 'hourly': dateFormat = 'YYYY-MM-DD HH24:00:00'; break;
            case 'daily': dateFormat = 'YYYY-MM-DD'; break;
            case 'monthly': dateFormat = 'YYYY-MM'; break;
            default: dateFormat = 'YYYY-MM-DD';
        }

        let query = db('payments')
            .select(
                db.raw(`TO_CHAR(created_at, ?) as period`, [dateFormat]),
                db.raw('COUNT(*) as total_payments'),
                db.raw('COUNT(*) FILTER (WHERE status = ?) as successful_count', ['succeeded']),
                db.raw('COUNT(*) FILTER (WHERE status = ?) as failed_count', ['failed']),
                db.raw('COALESCE(SUM(amount) FILTER (WHERE status = ?), 0) as total_revenue', ['succeeded']),
                db.raw('COALESCE(SUM(amount) FILTER (WHERE status = ?), 0) as failed_revenue', ['failed'])
            )
            .groupBy(db.raw(`TO_CHAR(created_at, ?)`, [dateFormat]))
            .orderBy(db.raw(`TO_CHAR(created_at, ?)`, [dateFormat]), 'desc')
            .limit(parseInt(limit));

        if (seller_id) query = query.where({ seller_id });
        if (company_id) query = query.where({ company_id });
        if (shop_id) query = query.where({ shop_id });

        return await query;
    }


    /**
     * Get gateway performance stats
     */
    async getGatewayPerformance(filters = {}) {
        const { seller_id, start_date, end_date } = filters;

        let query = db('payments')
            .select(
                'gateway',
                db.raw('COUNT(*) as total_payments'),
                db.raw('COUNT(*) FILTER (WHERE status = ?) as successful_payments', ['succeeded']),
                db.raw('COUNT(*) FILTER (WHERE status = ?) as failed_payments', ['failed']),
                db.raw('COALESCE(SUM(amount) FILTER (WHERE status = ?), 0) as total_revenue', ['succeeded'])
            )
            .groupBy('gateway');

        if (seller_id) query = query.where({ seller_id });
        if (start_date) query = query.where('created_at', '>=', start_date);
        if (end_date) query = query.where('created_at', '<=', end_date);

        return await query;
    }

    /**
     * [PLATFORM] Get total system overview
     */
    async getPlatformOverview(filters = {}) {
        const { start_date, end_date } = filters;

        let query = db('payments')
            .select(
                db.raw('COUNT(*) as total_system_transactions'),
                db.raw('COALESCE(SUM(amount) FILTER (WHERE status = ?), 0) as total_system_revenue', ['succeeded']),
                db.raw('COUNT(DISTINCT company_id) as active_companies'),
                db.raw('COUNT(DISTINCT shop_id) as active_shops'),
                db.raw('COUNT(*) FILTER (WHERE status = ?) as successful_tx', ['succeeded']),
                db.raw('COUNT(*) FILTER (WHERE status = ?) as failed_tx', ['failed'])
            );

        if (start_date) query = query.where('created_at', '>=', start_date);
        if (end_date) query = query.where('created_at', '<=', end_date);

        const result = await query.first();

        // Calculate System Success Rate
        const total = parseInt(result.total_system_transactions);
        const success = parseInt(result.successful_tx);
        result.global_success_rate = total > 0 ? ((success / total) * 100).toFixed(2) : 0;

        return result;
    }

    /**
     * [PLATFORM] Get top performing companies by revenue
     */
    async getPlatformTopCompanies(limit = 10) {
        return await db('payments')
            .select(
                'company_id',
                db.raw('COALESCE(SUM(amount), 0) as total_volume'),
                db.raw('COUNT(*) as transaction_count')
            )
            .where({ status: 'succeeded' })
            .groupBy('company_id')
            .orderBy('total_volume', 'desc')
            .limit(limit);
    }

    /**
     * [CHARTS] Get data formatted for charts
     */
    async getChartData(filters = {}) {
        const { seller_id, company_id, shop_id, period = 'daily' } = filters;

        let dateFormat;
        switch (period) {
            case 'hourly': dateFormat = 'YYYY-MM-DD HH24:00:00'; break;
            case 'daily': dateFormat = 'YYYY-MM-DD'; break;
            case 'monthly': dateFormat = 'YYYY-MM'; break;
            default: dateFormat = 'YYYY-MM-DD';
        }

        // 1. Line Chart: Revenue & Volume & Failure over time
        let trendQuery = db('payments')
            .select(
                db.raw(`TO_CHAR(created_at, ?) as label`, [dateFormat]),
                db.raw('COALESCE(SUM(amount) FILTER (WHERE status = ?), 0) as revenue', ['succeeded']),
                db.raw('COALESCE(SUM(amount) FILTER (WHERE status = ?), 0) as failed_revenue', ['failed']),
                db.raw('COUNT(*) as count'),
                db.raw('COUNT(*) FILTER (WHERE status = ?) as successful_count', ['succeeded']),
                db.raw('COUNT(*) FILTER (WHERE status = ?) as failed_count', ['failed'])
            )
            .groupBy(db.raw(`TO_CHAR(created_at, ?)`, [dateFormat]))
            .orderBy(db.raw(`TO_CHAR(created_at, ?)`, [dateFormat]), 'asc') // ASC for charts
            .limit(30);

        // 2. Pie Chart: Payment Method Distribution
        let methodQuery = db('payments')
            .select('gateway as name', db.raw('COUNT(*) as value'))
            .groupBy('gateway');

        // 3. Status Distribution
        let statusQuery = db('payments')
            .select('status as name', db.raw('COUNT(*) as value'))
            .groupBy('status');

        // Apply filters to all components
        const applyFilters = (q) => {
            if (seller_id) q.where({ seller_id });
            if (company_id) q.where({ company_id });
            if (shop_id) q.where({ shop_id });
            return q;
        };

        const [trendData, methodData, statusData] = await Promise.all([
            applyFilters(trendQuery),
            applyFilters(methodQuery),
            applyFilters(statusQuery)
        ]);

        return {
            trends: trendData,
            payment_methods: methodData,
            status_distribution: statusData
        };
    }
    /**
     * Get company revenue breakdown by shop
     */
    async getCompanyShopBreakdown(company_id, filters = {}) {
        const { start_date, end_date } = filters;

        let query = db('payments')
            .select(
                'shop_id',
                db.raw('COALESCE(SUM(amount) FILTER (WHERE status = ?), 0) as total_revenue', ['succeeded']),
                db.raw('COALESCE(SUM(amount) FILTER (WHERE status = ?), 0) as failed_revenue', ['failed']),
                db.raw('COUNT(*) as transaction_count'),
                db.raw('COUNT(*) FILTER (WHERE status = ?) as successful_count', ['succeeded']),
                db.raw('COUNT(*) FILTER (WHERE status = ?) as failed_count', ['failed'])
            )
            .where({ company_id })
            .groupBy('shop_id')
            .orderBy('total_revenue', 'desc');

        if (start_date) query = query.where('created_at', '>=', start_date);
        if (end_date) query = query.where('created_at', '<=', end_date);

        const shops = await query;

        // Calculate total company revenue from the breakdown
        const companyTotal = shops.reduce((sum, shop) => sum + parseFloat(shop.total_revenue), 0);
        const totalTransactions = shops.reduce((sum, shop) => sum + parseInt(shop.transaction_count), 0);

        return {
            company_id,
            total_revenue: companyTotal,
            total_transactions: totalTransactions,
            shops: shops
        };
    }
}

module.exports = new ReportingRepository();
