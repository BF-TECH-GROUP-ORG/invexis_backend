const AuditLog = require("../models/AuditLog.model");

/**
 * Get audit logs with filters
 * Query params:
 * - source (service name)
 * - type (event type) 
 * - entityId, entityType
 * - companyId, shopId, userId, workerId
 * - severity, category
 * - search (text search in description/event_type)
 * - startDate, endDate
 * - page, limit
 */
exports.getLogs = async (req, res) => {
    try {
        const {
            source, type, entityId, entityType,
            shopId, workerId, severity, category, search,
            startDate, endDate, page = 1, limit = 20
        } = req.query;

        const query = {};

        if (source) query.source_service = source;
        if (type) query.event_type = type;

        // Enhanced filtering using new schema fields
        if (entityId) query.entityId = entityId;
        if (entityType) query.entityType = entityType;
        if (shopId) query.shopId = shopId;
        if (workerId) query.workerId = workerId;
        if (severity) query.severity = severity;
        if (category) query.category = category;

        const { companyId, userId } = req.query;

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

        // Text search
        if (search) {
            query.$or = [
                { description: { $regex: search, $options: 'i' } },
                { event_type: { $regex: search, $options: 'i' } }
            ];
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

/**
 * Export audit logs (CSV or JSON)
 */
exports.exportLogs = async (req, res) => {
    try {
        const { format = 'json', ...filters } = req.query;

        // Build query similar to getLogs
        const query = {};
        const userRole = req.user.role;
        const allowedCompanies = req.user.companies || [];

        // Apply security filters
        if (userRole !== 'super_admin') {
            if (filters.companyId) {
                if (!allowedCompanies.includes(filters.companyId)) {
                    return res.status(403).json({ success: false, message: 'Access denied' });
                }
                query.companyId = filters.companyId;
            } else if (allowedCompanies.length > 0) {
                query.companyId = { $in: allowedCompanies };
            } else {
                return res.status(403).json({ success: false, message: 'No access to any company data' });
            }
        } else if (filters.companyId) {
            query.companyId = filters.companyId;
        }

        // Apply other filters
        if (filters.shopId) query.shopId = filters.shopId;
        if (filters.workerId) query.workerId = filters.workerId;
        if (filters.userId) query.userId = filters.userId;
        if (filters.event_type) query.event_type = filters.event_type;
        if (filters.severity) query.severity = filters.severity;
        if (filters.category) query.category = filters.category;
        if (filters.entityType) query.entityType = filters.entityType;
        if (filters.entityId) query.entityId = filters.entityId;

        if (filters.startDate || filters.endDate) {
            query.occurred_at = {};
            if (filters.startDate) query.occurred_at.$gte = new Date(filters.startDate);
            if (filters.endDate) query.occurred_at.$lte = new Date(filters.endDate);
        }

        // Limit export to reasonable size
        const logs = await AuditLog.find(query)
            .sort({ occurred_at: -1 })
            .limit(10000)
            .lean();

        if (format === 'csv') {
            // CSV export
            const fields = [
                'occurred_at', 'event_type', 'source_service', 'companyId', 'shopId',
                'userId', 'workerId', 'entityType', 'entityId', 'severity', 'category', 'description'
            ];

            const csv = [
                fields.join(','),
                ...logs.map(log => fields.map(field => {
                    const value = log[field];
                    if (value === null || value === undefined) return '';
                    if (value instanceof Date) return value.toISOString();
                    return `"${String(value).replace(/"/g, '""')}"`;
                }).join(','))
            ].join('\n');

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${Date.now()}.csv`);
            res.send(csv);
        } else {
            // JSON export
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${Date.now()}.json`);
            res.json({ success: true, data: logs, count: logs.length });
        }
    } catch (error) {
        console.error("Error exporting audit logs:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
