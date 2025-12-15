// src/routes/notification.js
const express = require('express');
const Notification = require('../models/Notification');
const redisClient = require('/app/shared/redis');
const router = express.Router();

const CACHE_TTL = 300; // 5 minutes

// Helper to generate cache key
const getCacheKey = (params) => {
    return `notifications:${JSON.stringify(params)}`;
};

/**
 * POST /mark-read
 * Mark notifications as read
 */
router.post('/mark-read', async (req, res) => {
    try {
        const { userId, notificationIds, all } = req.body;

        if (!userId) {
            return res.status(400).json({ error: "userId is required" });
        }

        let result;
        if (all) {
            // Mark all for this user (optionally filtered by company/shop if passed? keeping simple for now)
            result = await Notification.updateMany(
                { userId, readBy: { $ne: userId } },
                { $addToSet: { readBy: userId } }
            );
        } else if (Array.isArray(notificationIds) && notificationIds.length > 0) {
            result = await Notification.updateMany(
                { _id: { $in: notificationIds }, userId }, // Verify ownership/targeting
                { $addToSet: { readBy: userId } }
            );
        } else {
            return res.status(400).json({ error: "notificationIds (array) or all (boolean) required" });
        }

        // Invalidate cache for this user
        // Pattern match invalidation is expensive/complex in basic Redis (KEYS *). 
        // For efficiency, we might just accept short TTLs or use specific invalidation if we knew the exact keys.
        // Or specific key patterns.
        // A simple approach: key prefix 'notifications:{"userId":"..."*

        try {
            const keys = await redisClient.keys(`notifications:{"userId":"${userId}"*`);
            if (keys.length > 0) {
                await redisClient.del(...keys);
            }
        } catch (cacheError) {
            console.error("Error invalidating cache:", cacheError);
            // Don't fail the request if cache clearing fails
        }

        res.json({ success: true, updated: result.modifiedCount });
    } catch (error) {
        console.error("Error marking notifications as read:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/**
 * GET /:userId
 * Fetch notifications with filters (companyId, shopId, role)
 */
router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { companyId, shopId, role, unreadOnly, page = 1, limit = 50 } = req.query;

        // Cache key based on all parameters
        const cacheKey = getCacheKey({ userId, companyId, shopId, role, unreadOnly, page, limit });

        // Try getting from cache
        const cachedDecorated = await redisClient.get(cacheKey);
        if (cachedDecorated) {
            return res.json(JSON.parse(cachedDecorated));
        }

        // Build query
        const query = { userId };

        if (companyId) query.companyId = companyId;
        if (shopId) query.shopId = shopId;
        if (role) query.roles = role; // Assuming roles is an array, exact match or use $in if needed.
        // If user passes single role, we might want to check if notification targets that role.

        if (unreadOnly === 'true') {
            // "readBy" usually stores userIds who read it. 
            // If userId is in readBy, it's read. So unread means userId NOT in readBy.
            query.readBy = { $ne: userId };
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const notifications = await Notification.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        // Cache result
        await redisClient.setex(cacheKey, CACHE_TTL, JSON.stringify(notifications));

        res.json(notifications);
    } catch (error) {
        console.error("Error fetching notifications:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;