// routes/stockChangeRoutes.js
const express = require('express');
const router = express.Router();
const {
  getAllStockChanges,
  getStockChangeById,
  createStockChange,
  getStockHistory
} = require('../controllers/stockChangeController');

router.get('/', getAllStockChanges);
router.get('/history', getStockHistory);
router.get('/:id', getStockChangeById);
router.post('/', createStockChange);

module.exports = router;