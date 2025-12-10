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
