// src/controllers/notifications.js
const express = require('express');
const Notification = require('../models/Notification');
const router = express.Router();

router.get('/:userId', async (req, res) => {
    const notifications = await Notification.find({ userId: req.params.userId })
        .sort({ createdAt: -1 })
        .limit(50);
    res.json(notifications);
});

module.exports = router;