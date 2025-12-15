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
  // Advanced Reports
  ,
  getExecutiveDashboard,
  getRealTimeMetrics,
  getSalesAnalytics,
  getForecast,
  getInventoryOptimization,
  getBenchmarks,
  buildCustomReport
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

// ==================== ADVANCED REPORTS ====================
router.get('/dashboard', getExecutiveDashboard);
router.get('/metrics/realtime', getRealTimeMetrics);
router.get('/analytics/sales', getSalesAnalytics);
router.get('/forecast', getForecast);
router.get('/optimization', getInventoryOptimization);
router.get('/benchmarks', getBenchmarks);
router.post('/custom', buildCustomReport);

module.exports = router;