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


const { authenticateToken, requireRole } = require('/app/shared/middlewares/auth/production-auth');


router.get('/daily', authenticateToken, requireRole(['super_admin','company_admin']), getDailyReport);
router.get('/product/:productId', authenticateToken, requireRole(['super_admin','company_admin']), getProductReport);
router.get('/inventory-summary', authenticateToken, requireRole(['super_admin','company_admin']), getInventorySummary);
router.get('/abc-analysis', authenticateToken, requireRole(['super_admin','company_admin']), getABCAnalysis);
router.get('/turnover', authenticateToken, requireRole(['super_admin','company_admin']), getInventoryTurnover);
router.get('/aging', authenticateToken, requireRole(['super_admin','company_admin']), getAgingInventory);
router.get('/stock-movement', authenticateToken, requireRole(['super_admin','company_admin']), getStockMovementReport);
router.get('/adjustments', authenticateToken, requireRole(['super_admin','company_admin']), getAdjustmentReport);
// Warehouse reports removed after warehouse feature removal
router.get('/alerts', authenticateToken, requireRole(['super_admin','company_admin']), getAlertSummary);
router.get('/discount-impact', authenticateToken, requireRole(['super_admin','company_admin']), getDiscountImpact);

// ==================== ADVANCED REPORTS ====================
router.get('/dashboard', authenticateToken, requireRole(['super_admin','company_admin']), getExecutiveDashboard);
router.get('/metrics/realtime', authenticateToken, requireRole(['super_admin','company_admin']), getRealTimeMetrics);
router.get('/analytics/sales', authenticateToken, requireRole(['super_admin','company_admin']), getSalesAnalytics);
router.get('/forecast', authenticateToken, requireRole(['super_admin','company_admin']), getForecast);
router.get('/optimization', authenticateToken, requireRole(['super_admin','company_admin']), getInventoryOptimization);
router.get('/benchmarks', authenticateToken, requireRole(['super_admin','company_admin']), getBenchmarks);
router.post('/custom', authenticateToken, requireRole(['super_admin','company_admin']), buildCustomReport);

module.exports = router;