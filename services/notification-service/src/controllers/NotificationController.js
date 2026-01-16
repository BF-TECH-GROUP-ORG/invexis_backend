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

// 1. Get Notifications for User (with filters)
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
        const query = {
            $or: [
                { userId: userId }, // Directly targeted
                {
                    companyId: companyId || req.user.companyId,
                    scope: 'company',
                    roles: { $in: [currentRole] }
                },
                {
                    companyId: companyId || req.user.companyId,
                    scope: 'department',
                    roles: { $in: [currentRole] },
                    // Admins see all departments, workers only see their own
                    ...(currentRole !== 'company_admin' ? { departmentId: req.user.departmentId } : {})
                }
            ]
        };

        if (unreadOnly === 'true') {
            query.readBy = { $ne: userId };
        }

        // Apply filters to the $or branches if they were specified globally
        if (shopId) {
            query.$or.forEach(branch => branch.shopId = shopId);
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
