// src/controllers/health.js
const express = require('express');
const { healthCheck } = require('../config/rabbitmq');
const router = express.Router();

router.get('/health', async (req, res) => {
    const rabbitmqHealthy = await healthCheck();
    res.json({ status: 'ok', rabbitmq: rabbitmqHealthy, timestamp: new Date().toISOString() });
});

module.exports = router;