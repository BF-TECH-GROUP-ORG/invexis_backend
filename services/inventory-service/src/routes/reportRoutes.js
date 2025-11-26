// reportRoutes.js
const express = require('express');
const router = express.Router();
const {
  getDailyReport,
  getProductReport,
  getInventorySummary,
  getABCAnalysis,
  getInventoryTurnover,
  getAgingInventory,
  getStockMovementReport,
  getAdjustmentReport,
  getAlertSummary,
  getDiscountImpact
} = require('../controllers/reportController');

router.get('/daily', getDailyReport);
router.get('/product/:productId', getProductReport);
router.get('/inventory-summary', getInventorySummary);
router.get('/abc-analysis', getABCAnalysis);
router.get('/turnover', getInventoryTurnover);
router.get('/aging', getAgingInventory);
router.get('/stock-movement', getStockMovementReport);
router.get('/adjustments', getAdjustmentReport);
// Warehouse reports removed after warehouse feature removal
router.get('/alerts', getAlertSummary);
router.get('/discount-impact', getDiscountImpact);

module.exports = router;