const express = require("express");
const router = express.Router();
const ReportsController = require("../controllers/ReportsController");
const { authenticateToken, requireRole } = require('/app/shared/middlewares/auth/production-auth');

/**
 * COMPREHENSIVE SALES REPORTING ROUTES
 * Multiple dedicated endpoints for rich reporting capabilities
 */

// ==================== GENERAL SALES REPORTS ====================

/**
 * GET /reports/sales
 * Comprehensive sales report with all key metrics, top products, salespeople, shops
 * Query: companyId, shopId (optional), startDate, endDate
 */
router.get(
  "/sales",
  authenticateToken,
  requireRole(["super_admin", "company_admin", "worker"]),
  ReportsController.generalSalesReport
);

// ==================== REVENUE ANALYTICS ====================

/**
 * GET /reports/revenue/summary
 * Quick revenue overview for a period
 * Query: companyId, shopId (optional), startDate, endDate
 */
router.get(
  "/revenue/summary",
  authenticateToken,
  requireRole(["super_admin", "company_admin", "worker"]),
  ReportsController.revenueSummary
);

/**
 * GET /reports/revenue/trends
 * Revenue trends over time with granular control
 * Query: companyId, shopId (optional), startDate, endDate, granularity (daily|weekly|monthly)
 */
router.get(
  "/revenue/trends",
  authenticateToken,
  requireRole(["super_admin", "company_admin", "worker"]),
  ReportsController.revenueTrend
);

// ==================== PERIOD COMPARISONS ====================

/**
 * GET /reports/comparison
 * Compare any two custom periods
 * Query: companyId, shopId (optional), period1Start, period1End, period2Start, period2End
 */
router.get(
  "/comparison",
  authenticateToken,
  requireRole(["super_admin", "company_admin", "worker"]),
  ReportsController.periodComparison
);

/**
 * GET /reports/comparison/day
 * Compare today vs yesterday
 * Query: companyId, shopId (optional)
 */
router.get(
  "/comparison/day",
  authenticateToken,
  requireRole(["super_admin", "company_admin", "worker"]),
  ReportsController.dayComparison
);

/**
 * GET /reports/comparison/month
 * Compare current month vs last month
 * Query: companyId, shopId (optional)
 */
router.get(
  "/comparison/month",
  authenticateToken,
  requireRole(["super_admin", "company_admin", "worker"]),
  ReportsController.monthComparison
);

/**
 * GET /reports/comparison/year
 * Compare this year vs last year
 * Query: companyId, shopId (optional)
 */
router.get(
  "/comparison/year",
  authenticateToken,
  requireRole(["super_admin", "company_admin", "worker"]),
  ReportsController.yearComparison
);

// ==================== PRODUCT ANALYTICS ====================

/**
 * GET /reports/products/top
 * Get top selling products with customizable limit
 * Query: companyId, shopId (optional), startDate, endDate, limit
 */
router.get(
  "/products/top",
  authenticateToken,
  requireRole(["super_admin", "company_admin", "worker"]),
  ReportsController.topSellingProducts
);

/**
 * GET /reports/products/performance
 * Product performance with tier breakdown (Top, Moderate, Low performers)
 * Query: companyId, shopId (optional), startDate, endDate
 */
router.get(
  "/products/performance",
  authenticateToken,
  requireRole(["super_admin", "company_admin", "worker"]),
  ReportsController.productPerformanceReport
);

/**
 * GET /reports/categories
 * Category-wise sales and revenue breakdown
 * Query: companyId, shopId (optional), startDate, endDate
 */
router.get(
  "/categories",
  authenticateToken,
  requireRole(["super_admin", "company_admin", "worker"]),
  ReportsController.categoryReport
);

// ==================== SALESPERSON ANALYTICS ====================

/**
 * GET /reports/salespeople/performance
 * All salespeople performance with tier breakdown (Top, Moderate, Low performers)
 * Query: companyId, shopId (optional), startDate, endDate
 */
router.get(
  "/salespeople/performance",
  authenticateToken,
  requireRole(["super_admin", "company_admin", "worker"]),
  ReportsController.salesPersonPerformanceReport
);

/**
 * GET /reports/salespeople/:soldBy
 * Detailed report for a specific salesperson
 * Query: companyId, shopId (optional), startDate, endDate
 */
router.get(
  "/salespeople/:soldBy",
  authenticateToken,
  requireRole(["super_admin", "company_admin", "worker"]),
  ReportsController.salesPersonDetailedReport
);

/**
 * GET /reports/salespeople/:soldBy/trends
 * Sales trends for a specific salesperson
 * Query: companyId, shopId (optional), startDate, endDate, granularity (daily|weekly|monthly)
 */
router.get(
  "/salespeople/:soldBy/trends",
  authenticateToken,
  requireRole(["super_admin", "company_admin", "worker"]),
  ReportsController.salesPersonTrend
);

// ==================== SHOP ANALYTICS ====================

/**
 * GET /reports/shops/performance
 * Shop performance across company with tier breakdown (Top, Moderate, Low performers)
 * Query: companyId, startDate, endDate
 */
router.get(
  "/shops/performance",
  authenticateToken,
  requireRole(["super_admin", "company_admin", "worker"]),
  ReportsController.shopPerformanceReport
);

/**
 * GET /reports/shops/:shopId
 * Detailed report for a specific shop
 * Query: companyId, startDate, endDate
 */
router.get(
  "/shops/:shopId",
  authenticateToken,
  requireRole(["super_admin", "company_admin", "worker"]),
  ReportsController.shopDetailedReport
);

// ==================== CUSTOMER ANALYTICS ====================

/**
 * GET /reports/customers/:knownUserId
 * Customer purchase history and analytics
 * Query: companyId, shopId (optional)
 */
router.get(
  "/customers/:knownUserId",
  authenticateToken,
  requireRole(["super_admin", "company_admin", "worker"]),
  ReportsController.customerAnalytics
);

// ==================== PAYMENT METHOD ANALYTICS ====================

/**
 * GET /reports/payment-methods
 * Payment method breakdown and analytics
 * Query: companyId, shopId (optional), startDate, endDate
 */
router.get(
  "/payment-methods",
  authenticateToken,
  requireRole(["super_admin", "company_admin", "worker"]),
  ReportsController.paymentMethodAnalytics
);

module.exports = router;
