const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const reportController = require('../controllers/reportController');

router.get('/daily', authMiddleware, reportController.getDailyReport);
router.get('/product/:productId', authMiddleware, reportController.getProductReport);

module.exports = router;