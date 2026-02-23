const Notification = require('../models/Notification');
const redisClient = require('/app/shared/redis');
const notificationEventProcessor = require('../services/notificationEventProcessor');
const { v4: uuidv4 } = require('uuid');

const CACHE_TTL = 300; // 5 minutes

// Helper to generate cache key
const getCacheKey = (params) => {
    return `notifications:${JSON.stringify(params)}`;
};

/**
 * NotificationController
 * Handles API requests for notifications
 */

// 1. Get User Preferences
exports.getPreferences = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const companyId = req.query.companyId || req.user.companyId || (req.user.companies && req.user.companies[0]);

        const preferenceService = require('../services/preferenceService');
        const prefs = await preferenceService.getPreferences(userId, companyId);

        res.json({ success: true, data: prefs });
    } catch (error) {
        console.error("Error fetching preferences:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// 2. Update User Preferences
exports.updatePreferences = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const companyId = req.body.companyId || req.user.companyId || (req.user.companies && req.user.companies[0]);
        const newPrefs = req.body.preferences;

        if (!newPrefs || typeof newPrefs !== 'object') {
            return res.status(400).json({ success: false, message: "Invalid preferences object" });
        }

        const preferenceService = require('../services/preferenceService');
        const updated = await preferenceService.updatePreferences(userId, companyId, newPrefs);

        res.json({ success: true, data: updated.preferences, message: "Preferences updated" });
    } catch (error) {
        console.error("Error updating preferences:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// 3. Get Notifications for User (with filters)
exports.getNotifications = async (req, res) => {
    try {
        const userId = req.params.userId || req.user._id || req.user.id;
        const { companyId, shopId, role, unreadOnly, page = 1, limit = 50 } = req.query;

        // Security Check: If requesting data for a specific userId DIFFERENT from token, deny (unless admin?)
        // Assuming current user can only see their own notifications.
        if (req.user._id && userId !== req.user._id.toString() && userId !== req.user.id) {
            // Allow if super_admin or maybe system logic, but generally strictly personal
            if (req.user.role !== 'super_admin') {
                return res.status(403).json({ success: false, message: "Cannot view other users' notifications" });
            }
        }

        // Cache key based on all parameters
        const cacheKey = getCacheKey({ userId, companyId, shopId, role, unreadOnly, page, limit });

        // Try getting from cache
        const cachedDecorated = await redisClient.get(cacheKey);
        if (cachedDecorated) {
            return res.json({ success: true, data: JSON.parse(cachedDecorated), source: 'cache' });
        }

        // Build query to include personal, company-wide, and department-wide notifications
        const currentRole = role || req.user.role;
        const userAssignedDepts = req.user.assignedDepartments || [];
        const isManagementOrAdmin = currentRole === 'company_admin' || userAssignedDepts.includes('management');
        const userCompanyId = companyId || req.user.companyId || (req.user.companies && req.user.companies[0]);

        const query = {
            companyId: userCompanyId,
            $or: [
                { userId: userId }, // Directly targeted (personal)
                {
                    scope: 'company',
                    roles: { $in: [currentRole] }
                },
                {
                    scope: 'department',
                    // Oversight: Admins and Management workers see all departments.
                    // Others only see departments they are assigned to.
                    ...(isManagementOrAdmin ? {} : { departmentId: { $in: userAssignedDepts } })
                },
                {
                    scope: 'admin',
                    roles: { $in: [currentRole] }
                }
            ]
        };

        // Hierarchy Enforcement for Workers:
        // Only management department workers (or admins) see "company" scope by default for sensitive events.
        // However, we'll keep it broad for now unless it's specifically for 'management' dept.

        if (unreadOnly === 'true') {
            query.readBy = { $ne: userId };
        }

        // Apply shop filtering:
        // If shopId is explicitly provided (and not "all"), filter all results to that shop.
        // If shopId is "all", it means the user wants company-wide history.
        if (shopId && shopId !== 'all') {
            // Apply shopId to all branches of the $or query
            query.$or = query.$or.map(branch => ({ ...branch, shopId }));
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const notifications = await Notification.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Notification.countDocuments(query);

        const result = {
            notifications,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / parseInt(limit))
            }
        };

        // Cache result
        await redisClient.setex(cacheKey, CACHE_TTL, JSON.stringify(result));

        res.json({ success: true, data: result });
    } catch (error) {
        console.error("Error fetching notifications:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// 2. Mark as Read
exports.markAsRead = async (req, res) => {
    try {
        const { notificationIds, all } = req.body;
        const userId = req.user._id || req.user.id;

        if (!userId) {
            return res.status(400).json({ success: false, message: "User context not found" });
        }

        const eligibilityQuery = {
            $or: [
                { userId: userId },
                {
                    companyId: req.user.companyId,
                    scope: 'company',
                    roles: { $in: [req.user.role] }
                },
                {
                    companyId: req.user.companyId,
                    scope: 'department',
                    roles: { $in: [req.user.role] },
                    departmentId: req.user.departmentId
                }
            ]
        };

        let result;
        if (all) {
            // Mark all eligible for this user
            result = await Notification.updateMany(
                { ...eligibilityQuery, readBy: { $ne: userId } },
                { $addToSet: { readBy: userId } }
            );
        } else if (Array.isArray(notificationIds) && notificationIds.length > 0) {
            result = await Notification.updateMany(
                { ...eligibilityQuery, _id: { $in: notificationIds } },
                { $addToSet: { readBy: userId } }
            );
        } else {
            return res.status(400).json({ success: false, message: "notificationIds (array) or all (boolean) required" });
        }

        // Invalidate cache
        try {
            // Invalidate all keys for this user. Redis KEYS is slow. 
            // In production, we might use a version/timestamp approach or SCAN. 
            // For now, attempting the logic found in old route (scan/keys)
            const keys = await redisClient.keys(`notifications:{"userId":"${userId}"*`);
            if (keys.length > 0) {
                await redisClient.del(...keys);
            }
        } catch (cacheError) {
            console.warn("Cache invalidation failed (non-critical):", cacheError.message);
        }

        res.json({ success: true, updated: result.modifiedCount });
    } catch (error) {
        console.error("Error marking read:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// 3. Create Notification (Internal/Admin only)
exports.createNotification = async (req, res) => {
    try {
        const { type, recipient, message, data, companyId } = req.body;

        // This endpoint bypasses the event queue and creates directly. 
        // useful for testing or immediate system alerts.

        const newNotif = new Notification({
            title: message.title || 'Notification',
            body: message.body || message, // support simple string or object
            templateName: type || 'generic',
            userId: recipient,
            companyId: companyId || 'system',
            scope: 'personal',
            channels: { inApp: true },
            payload: data || {}
        });

        await newNotif.save();

        res.status(201).json({ success: true, data: newNotif });

    } catch (error) {
        console.error("Error creating notification:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// 4. Simulate Event (Testing/Dev only)
exports.simulateEvent = async (req, res) => {
    try {
        // Security: Only allow event simulation in non-production environments
        if (process.env.NODE_ENV === 'production') {
            return res.status(403).json({
                success: false,
                message: "Event simulation is disabled in production for security reasons"
            });
        }

        const { type, data, source } = req.body;
        // Require lazily or ensure it's imported at top
        const recipientResolver = require('../services/recipientResolver');

        // Force clear cache to ensure fresh data for simulation
        recipientResolver.clearCache();

        if (!type || !data) {
            return res.status(400).json({ success: false, message: "Type and data are required" });
        }

        const event = {
            id: uuidv4(),
            type,
            data,
            source: source || 'notification-debugger',
            emittedAt: new Date()
        };

        // Fire-and-forget processing to mimic event queue
        notificationEventProcessor.processEvent(event, 'simulated.topic');

        res.json({
            success: true,
            message: "Event injected into processor",
            eventId: event.id,
            event
        });

    } catch (error) {
        console.error("Error simulating event:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
