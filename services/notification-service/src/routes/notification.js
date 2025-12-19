// src/routes/notification.js
const express = require('express');
const router = express.Router();
const NotificationController = require('../controllers/NotificationController');
const { authenticateToken } = require('/app/shared/middlewares/auth/production-auth');

// Apply Auth Middleware to all routes
router.use(authenticateToken);

// Mark as read
router.post('/mark-read', NotificationController.markAsRead);

// Create (Manual/Admin)
router.post('/', NotificationController.createNotification);

// Get notifications
// Supports /:userId param for backward compatibility or explicit targeting, 
// but Controller defaults to req.user.id if param matches or is missing.
router.get('/:userId', NotificationController.getNotifications);
// Also support root get for "my notifications"
router.get('/', NotificationController.getNotifications);

module.exports = router;