const AnalyticsEvent = require("../models/AnalyticsEvent.model");
const sequelize = require("../config/database");
const { Op } = require("sequelize");
const { startOfDay, endOfDay, subDays, format } = require("date-fns");

/**
 * Get distinct event types stored in the database
 */
exports.getEventTypes = async (req, res) => {
    try {
        const types = await AnalyticsEvent.findAll({
            attributes: [[sequelize.fn("DISTINCT", sequelize.col("event_type")), "event_type"]],
            raw: true,
        });

        // Extract strings from objects
        const eventTypes = types.map(t => t.event_type);

        res.json({
            success: true,
            data: eventTypes
        });
    } catch (error) {
        console.error("Error fetching event types:", error);
        res.status(500).json({ success: false, message: "Failed to fetch event types" });
    }
};

/**
 * Get aggregated stats for events over a time range
 * Query params:
 * - startDate (ISO string)
 * - endDate (ISO string)
 * - interval ('hour', 'day')
 * - eventType (optional filter)
 */
exports.getEventStats = async (req, res) => {
    try {
        const { startDate, endDate, interval = 'day', eventType } = req.query;

        // Default to last 7 days if no range provided
        const start = startDate ? new Date(startDate) : subDays(new Date(), 7);
        const end = endDate ? new Date(endDate) : new Date();

        const timeBucket = interval === 'hour' ? '1 hour' : '1 day';

        // Construct where clause
        const where = {
            time: {
                [Op.between]: [start, end]
            }
        };

        if (eventType) {
            where.event_type = eventType;
        }

        // Use TimescaleDB's time_bucket if available, or just standard postgres date_trunc
        // Since we are using Sequelize, we'll use raw SQL specific to Postgres/Timescale
        // Note: time_bucket is generally better for Timescale, but date_trunc is standard PG compatible.
        // Let's use time_bucket and fallback to date_trunc if needed (manually handled in query construction usually).
        // For simplicity and compatibility, we will use date_trunc which works on both standard PG and Timescale.

        const intervalStr = interval === 'hour' ? 'hour' : 'day';

        const stats = await AnalyticsEvent.findAll({
            attributes: [
                [sequelize.fn('date_trunc', intervalStr, sequelize.col('time')), 'bucket'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            where,
            group: [sequelize.fn('date_trunc', intervalStr, sequelize.col('time'))],
            order: [[sequelize.fn('date_trunc', intervalStr, sequelize.col('time')), 'ASC']],
            raw: true
        });

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        console.error("Error fetching event stats:", error);
        res.status(500).json({ success: false, message: "Failed to fetch stats" });
    }
};
/**
 * Get Dashboard Summary (Fast, using Continuous Aggregates)
 */
exports.getDashboardSummary = async (req, res) => {
    try {
        const { companyId } = req.query;
        // TimescaleDB Real-time aggregations combine view + raw log automatically if configured.
        // We query the materialized view 'sales_daily_summary'

        let whereClause = "WHERE bucket >= NOW() - INTERVAL '30 days'";
        const replacements = {};

        if (companyId) {
            whereClause += ' AND "companyId" = :companyId';
            replacements.companyId = companyId;
        }

        const query = `
            SELECT 
                bucket as date,
                SUM(total_revenue) as revenue,
                SUM(total_orders) as orders,
                SUM(total_items) as items
            FROM sales_daily_summary
            ${whereClause}
            GROUP BY bucket
            ORDER BY bucket ASC
        `;

        const stats = await sequelize.query(query, {
            replacements,
            type: sequelize.QueryTypes.SELECT
        });

        // Calculate totals
        const totalRevenue = stats.reduce((acc, curr) => acc + parseFloat(curr.revenue), 0);
        const totalOrders = stats.reduce((acc, curr) => acc + parseInt(curr.orders), 0);

        res.json({
            success: true,
            data: {
                totals: {
                    revenue: totalRevenue,
                    orders: totalOrders
                },
                trend: stats
            }
        });

    } catch (error) {
        console.error("Dashboard Summary Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get Platform Health (Growth & Traffic)
 */
exports.getPlatformHealth = async (req, res) => {
    try {
        // 1. Total Companies (Active in last 30d)
        // We can query sales_metrics distinct count
        const companiesCount = await sequelize.query(`
            SELECT COUNT(DISTINCT "companyId") as count 
            FROM sales_metrics 
            WHERE time > NOW() - INTERVAL '30 days'
        `, { type: sequelize.QueryTypes.SELECT });

        // 2. Event Throughput (Last 24h)
        const eventThroughput = await sequelize.query(`
            SELECT 
                time_bucket('1 hour', time) as hour,
                COUNT(*) as count
            FROM analytics_events
            WHERE time > NOW() - INTERVAL '24 hours'
            GROUP BY hour
            ORDER BY hour ASC
        `, { type: sequelize.QueryTypes.SELECT });

        res.json({
            success: true,
            data: {
                activeCompanies30d: parseInt(companiesCount[0]?.count || 0),
                eventThroughput24h: eventThroughput
            }
        });

    } catch (error) {
        console.error("Platform Health Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
