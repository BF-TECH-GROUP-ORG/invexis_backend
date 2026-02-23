// src/routes/notification.js
const express = require('express');
const router = express.Router();
const NotificationController = require('../controllers/NotificationController');
const { authenticateToken } = require('/app/shared/middlewares/auth/production-auth');

const { checkSubscriptionStatus } = require('/app/shared/middlewares/subscription/production-subscription');

// Apply Auth & Subscription Middleware to all routes
router.use(authenticateToken);
router.use(checkSubscriptionStatus());

// Get/Update preferences
router.get('/preferences', NotificationController.getPreferences);
router.put('/preferences', NotificationController.updatePreferences);

// Mark as read
router.post('/mark-read', NotificationController.markAsRead);

// Create (Manual/Admin)
router.post('/', NotificationController.createNotification);

// Simulate Event (Dev/Test)
router.post('/simulate', NotificationController.simulateEvent);

// Get notifications
// Supports /:userId param for backward compatibility or explicit targeting, 
// but Controller defaults to req.user.id if param matches or is missing.
router.get('/:userId', NotificationController.getNotifications);
// Also support root get for "my notifications"
router.get('/', NotificationController.getNotifications);

module.exports = router;