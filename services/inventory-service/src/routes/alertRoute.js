const express = require('express');
const { createAlert, getUnresolvedAlerts } = require('../controllers/alertController');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

router.post('/', authMiddleware, createAlert);
router.get('/unresolved', authMiddleware, getUnresolvedAlerts);

module.exports = router;