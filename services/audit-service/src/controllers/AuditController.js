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

        // Enhanced filtering using new schema fields
        if (entityId) {
            query.entityId = entityId;
        }

        const { companyId, userId, entityType } = req.query;

        // --- Security / Multi-tenancy ---
        const userRole = req.user.role;
        const allowedCompanies = req.user.companies || [];

        // If not super_admin, restrict access
        if (userRole !== 'super_admin') {
            if (companyId) {
                // User requested specific company, verify they have access
                if (!allowedCompanies.includes(companyId)) {
                    return res.status(403).json({ success: false, message: 'Access denied to this company audit logs' });
                }
                query.companyId = companyId;
            } else {
                // Return logs for ALL their companies
                if (allowedCompanies.length > 0) {
                    query.companyId = { $in: allowedCompanies };
                } else {
                    // No companies assigned? return empty or ensure no leakage
                    return res.json({ success: true, data: [], pagination: { total: 0, page: 1, pages: 0 } });
                }
            }
        } else {
            // Admin can query any company
            if (companyId) query.companyId = companyId;
        }

        if (userId) query.userId = userId;
        if (entityType) query.entityType = entityType;

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

        // Security Check
        const userRole = req.user.role;
        if (userRole !== 'super_admin') {
            const allowedCompanies = req.user.companies || [];

            if (log.companyId && !allowedCompanies.includes(log.companyId)) {
                return res.status(403).json({ success: false, message: "Access denied" });
            }
        }

        res.json({ success: true, data: log });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
