const Order = require('../models/Order.models');
const Catalog = require('../models/Catalog.models');
const Promotion = require('../models/Promotion.models');
const cache = require('../utils/cache');
const { publish, exchanges } = require('/app/shared/rabbitmq');
const logger = require('../utils/logger');

// Notification preferences management
exports.setNotificationPreferences = async (req, res, next) => {
    try {
        const { companyId, userId } = req.query;
        const { preferences } = req.body;

        const preferencesObj = {
            email: preferences?.email || true,
            push: preferences?.push || true,
            sms: preferences?.sms || false,
            promotions: preferences?.promotions || true,
            orderUpdates: preferences?.orderUpdates || true,
            newArrivals: preferences?.newArrivals || true,
            priceDrops: preferences?.priceDrops || true,
            reviews: preferences?.reviews || false
        };

        const cacheKey = `notif_prefs:${companyId}:${userId}`;
        await cache.setJSON(cacheKey, preferencesObj, 2592000); // 30 days

        await publish(exchanges.topic, 'ecommerce.notification_preferences_updated', {
            companyId,
            userId,
            preferences: preferencesObj,
            timestamp: Date.now()
        });

        res.json({ success: true, message: 'Preferences updated', data: preferencesObj });
    } catch (error) {
        logger.error('Error in setNotificationPreferences:', error);
        next(error);
    }
};

// Get user notification preferences
exports.getNotificationPreferences = async (req, res, next) => {
    try {
        const { companyId, userId } = req.query;
        const cacheKey = `notif_prefs:${companyId}:${userId}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        // Default preferences if not set
        const defaultPrefs = {
            email: true,
            push: true,
            sms: false,
            promotions: true,
            orderUpdates: true,
            newArrivals: true,
            priceDrops: true,
            reviews: false
        };

        await cache.setJSON(cacheKey, defaultPrefs, 2592000);
        res.json({ success: true, data: defaultPrefs });
    } catch (error) {
        logger.error('Error in getNotificationPreferences:', error);
        next(error);
    }
};

// Trigger personalized notifications
exports.triggerPersonalNotification = async (req, res, next) => {
    try {
        const { companyId, userId, type, data } = req.body;

        const notification = {
            id: `notif_${Date.now()}`,
            userId,
            companyId,
            type, // 'order_shipped', 'price_drop', 'back_in_stock', 'promotion', 'review_request'
            title: data?.title || 'New Notification',
            message: data?.message,
            icon: data?.icon,
            action: data?.action,
            createdAt: new Date(),
            read: false
        };

        // Store notification (in production, use dedicated notification service)
        const cacheKey = `notifications:${companyId}:${userId}`;
        const existing = await cache.getJSON(cacheKey) || [];
        existing.push(notification);
        await cache.setJSON(cacheKey, existing.slice(-50), 604800); // Keep last 50, 7 days

        // Publish event for notification services (email, push, SMS)
        await publish(exchanges.topic, `ecommerce.notification.${type}`, {
            notificationId: notification.id,
            userId,
            companyId,
            data: notification,
            timestamp: Date.now()
        });

        res.json({ success: true, message: 'Notification triggered', data: notification });
    } catch (error) {
        logger.error('Error in triggerPersonalNotification:', error);
        next(error);
    }
};

// Get user notifications
exports.getUserNotifications = async (req, res, next) => {
    try {
        const { companyId, userId, limit = 20, offset = 0, unreadOnly = false } = req.query;
        const cacheKey = `notifications:${companyId}:${userId}`;
        const allNotifications = await cache.getJSON(cacheKey) || [];

        const filtered = unreadOnly === 'true'
            ? allNotifications.filter(n => !n.read)
            : allNotifications;

        const paginated = filtered.slice(offset, offset + limit);

        res.json({
            success: true,
            data: paginated,
            total: filtered.length,
            unreadCount: allNotifications.filter(n => !n.read).length
        });
    } catch (error) {
        logger.error('Error in getUserNotifications:', error);
        next(error);
    }
};

// Mark notification as read
exports.markAsRead = async (req, res, next) => {
    try {
        const { companyId, userId } = req.body;
        const { notificationId } = req.params;

        const cacheKey = `notifications:${companyId}:${userId}`;
        const notifications = await cache.getJSON(cacheKey) || [];

        const notif = notifications.find(n => n.id === notificationId);
        if (notif) notif.read = true;

        await cache.setJSON(cacheKey, notifications, 604800);
        res.json({ success: true, message: 'Notification marked as read' });
    } catch (error) {
        logger.error('Error in markAsRead:', error);
        next(error);
    }
};

// Mark all notifications as read
exports.markAllAsRead = async (req, res, next) => {
    try {
        const { companyId, userId } = req.body;
        const cacheKey = `notifications:${companyId}:${userId}`;
        const notifications = await cache.getJSON(cacheKey) || [];

        notifications.forEach(n => n.read = true);
        await cache.setJSON(cacheKey, notifications, 604800);

        res.json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
        logger.error('Error in markAllAsRead:', error);
        next(error);
    }
};

// Delete notification
exports.deleteNotification = async (req, res, next) => {
    try {
        const { companyId, userId } = req.body;
        const { notificationId } = req.params;

        const cacheKey = `notifications:${companyId}:${userId}`;
        let notifications = await cache.getJSON(cacheKey) || [];

        notifications = notifications.filter(n => n.id !== notificationId);
        await cache.setJSON(cacheKey, notifications, 604800);

        res.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        logger.error('Error in deleteNotification:', error);
        next(error);
    }
};

// Smart notification - Abandoned cart reminder
exports.sendAbandonedCartReminder = async (req, res, next) => {
    try {
        const { companyId, userId, cartData } = req.body;

        const reminder = {
            type: 'abandoned_cart',
            title: '⏰ Don\'t forget your items!',
            message: `You have ${cartData?.items?.length || 1} item(s) waiting in your cart. Complete your purchase before they run out!`,
            cartValue: cartData?.total,
            itemCount: cartData?.items?.length,
            incentive: '✨ Use code COMEBACK10 for 10% off' // Magic incentive
        };

        await publish(exchanges.topic, 'ecommerce.notification.abandoned_cart', {
            userId,
            companyId,
            cart: cartData,
            reminder,
            timestamp: Date.now()
        });

        await triggerPersonalNotification.call(
            null,
            { body: { companyId, userId, type: 'abandoned_cart', data: reminder } },
            res,
            next
        );
    } catch (error) {
        logger.error('Error in sendAbandonedCartReminder:', error);
        next(error);
    }
};

// Smart notification - Price drop alert
exports.sendPriceDropAlert = async (req, res, next) => {
    try {
        const { companyId, userId, productId, oldPrice, newPrice } = req.body;

        const savings = oldPrice - newPrice;
        const savingsPercent = Math.round((savings / oldPrice) * 100);

        const product = await Catalog.findOne({ companyId, productId }).lean();

        const alert = {
            type: 'price_drop',
            title: '💰 Price Drop!',
            message: `${product?.name} is now $${newPrice} (was $${oldPrice})`,
            oldPrice,
            newPrice,
            savings,
            savingsPercent,
            productId
        };

        await publish(exchanges.topic, 'ecommerce.notification.price_drop', {
            userId,
            companyId,
            productId,
            oldPrice,
            newPrice,
            alert,
            timestamp: Date.now()
        });

        res.json({ success: true, message: 'Price drop alert sent', data: alert });
    } catch (error) {
        logger.error('Error in sendPriceDropAlert:', error);
        next(error);
    }
};

// Smart notification - Back in stock
exports.sendBackInStockAlert = async (req, res, next) => {
    try {
        const { companyId, userId, productId } = req.body;

        const product = await Catalog.findOne({ companyId, productId }).lean();

        const alert = {
            type: 'back_in_stock',
            title: '📦 Back in Stock!',
            message: `${product?.name} is back in stock. Limited quantity available!`,
            productId,
            stockQty: product?.stockQty
        };

        await publish(exchanges.topic, 'ecommerce.notification.back_in_stock', {
            userId,
            companyId,
            productId,
            alert,
            timestamp: Date.now()
        });

        res.json({ success: true, message: 'Back in stock alert sent', data: alert });
    } catch (error) {
        logger.error('Error in sendBackInStockAlert:', error);
        next(error);
    }
};

// Order status update notification
exports.sendOrderStatusNotification = async (req, res, next) => {
    try {
        const { companyId, orderId, userId, status } = req.body;

        const statusMessages = {
            'pending': '⏳ Your order is being processed',
            'confirmed': '✅ Your order has been confirmed',
            'shipped': '🚚 Your order is on its way',
            'delivered': '📦 Your order has been delivered',
            'cancelled': '❌ Your order has been cancelled'
        };

        const notification = {
            type: 'order_status_update',
            title: 'Order Update',
            message: statusMessages[status] || `Your order status updated to ${status}`,
            orderId,
            status
        };

        await publish(exchanges.topic, `ecommerce.notification.order_${status}`, {
            userId,
            companyId,
            orderId,
            notification,
            timestamp: Date.now()
        });

        res.json({ success: true, message: 'Order status notification sent', data: notification });
    } catch (error) {
        logger.error('Error in sendOrderStatusNotification:', error);
        next(error);
    }
};

// Birthday/Anniversary special offer
exports.sendSpecialOccasionOffer = async (req, res, next) => {
    try {
        const { companyId, userId, occasion, discountCode, discountPercent } = req.body;

        const messages = {
            'birthday': '🎂 Happy Birthday! Enjoy %discount% off on us',
            'anniversary': '🎉 We\'re celebrating our %orderyears% year anniversary with you! %discount% off',
            'loyalty': '⭐ You\'re our VIP! Here\'s %discount% off as a thank you'
        };

        const message = messages[occasion]?.replace('%discount%', `${discountPercent}%`);

        const offer = {
            type: 'special_occasion',
            title: `Special ${occasion} Offer`,
            message,
            occasion,
            discountCode,
            discountPercent,
            expiresIn: '7 days'
        };

        await publish(exchanges.topic, 'ecommerce.notification.special_occasion', {
            userId,
            companyId,
            occasion,
            offer,
            timestamp: Date.now()
        });

        res.json({ success: true, message: 'Special occasion offer sent', data: offer });
    } catch (error) {
        logger.error('Error in sendSpecialOccasionOffer:', error);
        next(error);
    }
};

// Batch notification for promotional campaigns
exports.sendBatchNotification = async (req, res, next) => {
    try {
        const { companyId, userIds, title, message, data } = req.body;

        const notification = {
            id: `batch_${Date.now()}`,
            title,
            message,
            data,
            createdAt: new Date()
        };

        // Publish batch notification event
        await publish(exchanges.topic, 'ecommerce.notification.batch', {
            companyId,
            userIds,
            notification,
            totalRecipients: userIds?.length || 0,
            timestamp: Date.now()
        });

        res.json({
            success: true,
            message: `Notification sent to ${userIds?.length || 0} users`,
            data: notification
        });
    } catch (error) {
        logger.error('Error in sendBatchNotification:', error);
        next(error);
    }
};

// Create price alert
exports.createPriceAlert = async (req, res, next) => {
    try {
        const { companyId, userId, productId, targetPrice } = req.body;

        const alert = {
            alertId: `price_${Date.now()}`,
            userId,
            productId,
            targetPrice,
            createdAt: new Date(),
            active: true
        };

        res.json({ success: true, message: 'Price alert created', data: alert });
    } catch (error) {
        logger.error('Error in createPriceAlert:', error);
        next(error);
    }
};

// Get user price alerts
exports.getUserPriceAlerts = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { companyId } = req.query;

        const alerts = {
            userId,
            alerts: [
                { alertId: 'price_1', productId: 'prod1', targetPrice: 99.99, active: true },
                { alertId: 'price_2', productId: 'prod2', targetPrice: 199.99, active: true }
            ]
        };

        res.json({ success: true, data: alerts });
    } catch (error) {
        logger.error('Error in getUserPriceAlerts:', error);
        next(error);
    }
};

// Delete price alert
exports.deletePriceAlert = async (req, res, next) => {
    try {
        const { alertId } = req.params;
        const { companyId, userId } = req.body;

        res.json({ success: true, message: 'Price alert deleted' });
    } catch (error) {
        logger.error('Error in deletePriceAlert:', error);
        next(error);
    }
};

// Create stock alert
exports.createStockAlert = async (req, res, next) => {
    try {
        const { companyId, userId, productId } = req.body;

        const alert = {
            alertId: `stock_${Date.now()}`,
            userId,
            productId,
            createdAt: new Date(),
            active: true
        };

        res.json({ success: true, message: 'Stock alert created', data: alert });
    } catch (error) {
        logger.error('Error in createStockAlert:', error);
        next(error);
    }
};

// Get user stock alerts
exports.getUserStockAlerts = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { companyId } = req.query;

        const alerts = {
            userId,
            alerts: [
                { alertId: 'stock_1', productId: 'prod1', active: true },
                { alertId: 'stock_2', productId: 'prod2', active: true }
            ]
        };

        res.json({ success: true, data: alerts });
    } catch (error) {
        logger.error('Error in getUserStockAlerts:', error);
        next(error);
    }
};

// Delete stock alert
exports.deleteStockAlert = async (req, res, next) => {
    try {
        const { alertId } = req.params;
        const { companyId, userId } = req.body;

        res.json({ success: true, message: 'Stock alert deleted' });
    } catch (error) {
        logger.error('Error in deleteStockAlert:', error);
        next(error);
    }
};

// Get notification preferences
exports.getPreferences = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { companyId } = req.query;

        const cacheKey = `notif_prefs:${companyId}:${userId}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const defaultPrefs = {
            email: true,
            push: true,
            sms: false,
            promotions: true,
            orderUpdates: true,
            newArrivals: true,
            priceDrops: true,
            reviews: false
        };

        await cache.setJSON(cacheKey, defaultPrefs, 2592000);
        res.json({ success: true, data: defaultPrefs });
    } catch (error) {
        logger.error('Error in getPreferences:', error);
        next(error);
    }
};

// Update notification preferences
exports.updatePreferences = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { companyId, preferences } = req.body;

        const preferencesObj = {
            email: preferences?.email !== undefined ? preferences.email : true,
            push: preferences?.push !== undefined ? preferences.push : true,
            sms: preferences?.sms !== undefined ? preferences.sms : false,
            promotions: preferences?.promotions !== undefined ? preferences.promotions : true,
            orderUpdates: preferences?.orderUpdates !== undefined ? preferences.orderUpdates : true,
            newArrivals: preferences?.newArrivals !== undefined ? preferences.newArrivals : true,
            priceDrops: preferences?.priceDrops !== undefined ? preferences.priceDrops : true,
            reviews: preferences?.reviews !== undefined ? preferences.reviews : false
        };

        const cacheKey = `notif_prefs:${companyId}:${userId}`;
        await cache.setJSON(cacheKey, preferencesObj, 2592000);

        await publish(exchanges.topic, 'ecommerce.notification_preferences_updated', {
            companyId,
            userId,
            preferences: preferencesObj,
            timestamp: Date.now()
        });

        res.json({ success: true, message: 'Preferences updated', data: preferencesObj });
    } catch (error) {
        logger.error('Error in updatePreferences:', error);
        next(error);
    }
};

// Broadcast notification
exports.broadcastNotification = async (req, res, next) => {
    try {
        const { companyId, title, message, targetAudience } = req.body;

        const notification = {
            id: `broadcast_${Date.now()}`,
            title,
            message,
            targetAudience,
            createdAt: new Date()
        };

        await publish(exchanges.topic, 'ecommerce.notification.broadcast', {
            companyId,
            notification,
            timestamp: Date.now()
        });

        res.json({
            success: true,
            message: 'Broadcast notification sent',
            data: notification
        });
    } catch (error) {
        logger.error('Error in broadcastNotification:', error);
        next(error);
    }
};

// Broadcast to segment
exports.broadcastToSegment = async (req, res, next) => {
    try {
        const { companyId, segment, title, message } = req.body;

        const notification = {
            id: `segment_${Date.now()}`,
            title,
            message,
            segment,
            createdAt: new Date()
        };

        await publish(exchanges.topic, 'ecommerce.notification.segment', {
            companyId,
            segment,
            notification,
            timestamp: Date.now()
        });

        res.json({
            success: true,
            message: `Notification sent to ${segment} segment`,
            data: notification
        });
    } catch (error) {
        logger.error('Error in broadcastToSegment:', error);
        next(error);
    }
};

module.exports = exports;
