const express = require('express');
const { createDiscount, getActiveDiscounts } = require('../controllers/discountController');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

router.post('/', authMiddleware, createDiscount);
router.get('/active/:productId', authMiddleware, getActiveDiscounts);

module.exports = router;