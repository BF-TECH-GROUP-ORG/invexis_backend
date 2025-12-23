const AuditLog = require("../models/AuditLog.model");

/**
 * Get activity breakdown by shop
 */
exports.getActivityByShop = async (req, res) => {
    try {
        const { companyId, startDate, endDate } = req.query;

        if (!companyId) {
            return res.status(400).json({ success: false, message: "companyId is required" });
        }

        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const end = endDate ? new Date(endDate) : new Date();

        const data = await AuditLog.getActivityByShop(companyId, start, end);

        res.json({ success: true, data });
    } catch (error) {
        console.error("Error in getActivityByShop:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get activity breakdown by worker
 */
exports.getActivityByWorker = async (req, res) => {
    try {
        const { companyId, shopId, startDate, endDate } = req.query;

        if (!companyId) {
            return res.status(400).json({ success: false, message: "companyId is required" });
        }

        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const end = endDate ? new Date(endDate) : new Date();

        const data = await AuditLog.getActivityByWorker(companyId, shopId, start, end);

        res.json({ success: true, data });
    } catch (error) {
        console.error("Error in getActivityByWorker:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get event type distribution
 */
exports.getEventDistribution = async (req, res) => {
    try {
        const { companyId, shopId, startDate, endDate, category, severity } = req.query;

        const filters = {};
        if (companyId) filters.companyId = companyId;
        if (shopId) filters.shopId = shopId;
        if (category) filters.category = category;
        if (severity) filters.severity = severity;

        if (startDate || endDate) {
            filters.occurred_at = {};
            if (startDate) filters.occurred_at.$gte = new Date(startDate);
            if (endDate) filters.occurred_at.$lte = new Date(endDate);
        }

        const data = await AuditLog.getEventDistribution(filters);

        res.json({ success: true, data });
    } catch (error) {
        console.error("Error in getEventDistribution:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get severity trends over time
 */
exports.getSeverityTrends = async (req, res) => {
    try {
        const { companyId, shopId, startDate, endDate } = req.query;

        const match = {};
        if (companyId) match.companyId = companyId;
        if (shopId) match.shopId = shopId;

        if (startDate || endDate) {
            match.occurred_at = {};
            if (startDate) match.occurred_at.$gte = new Date(startDate);
            if (endDate) match.occurred_at.$lte = new Date(endDate);
        }

        const data = await AuditLog.aggregate([
            { $match: match },
            {
                $group: {
                    _id: {
                        severity: '$severity',
                        date: { $dateToString: { format: "%Y-%m-%d", date: "$occurred_at" } }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.date': 1 } }
        ]);

        res.json({ success: true, data });
    } catch (error) {
        console.error("Error in getSeverityTrends:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get change history for specific entity
 */
exports.getChangeHistory = async (req, res) => {
    try {
        const { entityId } = req.params;
        const { entityType } = req.query;

        const query = { entityId };
        if (entityType) query.entityType = entityType;

        const changes = await AuditLog.find(query)
            .select('event_type userId workerId changes occurred_at description')
            .sort({ occurred_at: -1 })
            .limit(100);

        res.json({ success: true, data: changes });
    } catch (error) {
        console.error("Error in getChangeHistory:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get user activity timeline
 */
exports.getUserActivityTimeline = async (req, res) => {
    try {
        const { userId, workerId, startDate, endDate, limit = 50 } = req.query;

        const query = {};
        if (userId) query.userId = userId;
        if (workerId) query.workerId = workerId;

        if (startDate || endDate) {
            query.occurred_at = {};
            if (startDate) query.occurred_at.$gte = new Date(startDate);
            if (endDate) query.occurred_at.$lte = new Date(endDate);
        }

        const timeline = await AuditLog.find(query)
            .select('event_type entityType entityId severity occurred_at description')
            .sort({ occurred_at: -1 })
            .limit(parseInt(limit));

        res.json({ success: true, data: timeline });
    } catch (error) {
        console.error("Error in getUserActivityTimeline:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get audit statistics
 */
exports.getStats = async (req, res) => {
    try {
        const { companyId, shopId, startDate, endDate } = req.query;

        const match = {};
        if (companyId) match.companyId = companyId;
        if (shopId) match.shopId = shopId;

        if (startDate || endDate) {
            match.occurred_at = {};
            if (startDate) match.occurred_at.$gte = new Date(startDate);
            if (endDate) match.occurred_at.$lte = new Date(endDate);
        }

        const [totalCount, bySeverity, byCategory] = await Promise.all([
            AuditLog.countDocuments(match),
            AuditLog.aggregate([
                { $match: match },
                { $group: { _id: '$severity', count: { $sum: 1 } } }
            ]),
            AuditLog.aggregate([
                { $match: match },
                { $group: { _id: '$category', count: { $sum: 1 } } }
            ])
        ]);

        res.json({
            success: true,
            data: {
                total: totalCount,
                bySeverity: bySeverity.reduce((acc, item) => {
                    acc[item._id || 'none'] = item.count;
                    return acc;
                }, {}),
                byCategory: byCategory.reduce((acc, item) => {
                    acc[item._id || 'none'] = item.count;
                    return acc;
                }, {})
            }
        });
    } catch (error) {
        console.error("Error in getStats:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
