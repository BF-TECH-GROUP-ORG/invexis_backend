const express = require('express');
const { createStockChange, getStockHistory } = require('../controllers/stockChangeController');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

router.post('/', authMiddleware, createStockChange);
router.get('/history/:productId', authMiddleware, getStockHistory);

module.exports = router;