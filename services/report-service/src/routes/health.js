const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

router.get('/', (req, res) => {
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';

    res.status(200).json({
        status: 'up',
        service: 'report-service',
        timestamp: new Date(),
        database: dbStatus
    });
});

module.exports = router;
