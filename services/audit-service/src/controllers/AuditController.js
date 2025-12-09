const AuditLog = require("../models/AuditLog.model");

/**
 * Get audit logs with filters
 * Query params:
 * - source (service name)
 * - type (event type)
 * - entityId (if stored in metadata)
 * - startDate, endDate
 * - page, limit
 */
exports.getLogs = async (req, res) => {
    try {
        const { source, type, entityId, startDate, endDate, page = 1, limit = 20 } = req.query;

        const query = {};

        if (source) query.source_service = source;
        if (type) query.event_type = type;

        // If entityId is passed, we might need to look inside payload or metadata
        // This depends on how we structure data. For now, let's assume it might be in metadata.entityId
        if (entityId) {
            query["metadata.entityId"] = entityId;
        }

        if (startDate || endDate) {
            query.occurred_at = {};
            if (startDate) query.occurred_at.$gte = new Date(startDate);
            if (endDate) query.occurred_at.$lte = new Date(endDate);
        }

        const logs = await AuditLog.find(query)
            .sort({ occurred_at: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const total = await AuditLog.countDocuments(query);

        res.json({
            success: true,
            data: logs,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error("Error fetching audit logs:", error);
        res.status(500).json({ success: false, message: "Failed to fetch logs" });
    }
};

/**
 * Get single log details
 */
exports.getLogDetails = async (req, res) => {
    try {
        const log = await AuditLog.findById(req.params.id);
        if (!log) {
            return res.status(404).json({ success: false, message: "Log not found" });
        }
        res.json({ success: true, data: log });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
