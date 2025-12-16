const express = require("express");
const router = express.Router();
const AnalyticsController = require("../controllers/AnalyticsController");
const ReportController = require("../controllers/ReportController");
const { authenticateToken, requireRole } = require('/app/shared/middlewares/auth/production-auth');

// Middleware to protect all analytics routes
router.use(authenticateToken);

// ==========================================
// 1. Platform Analytics (Super Admin Only)
// ==========================================

// Dashboard & Health
router.get("/dashboard/overview", requireRole('super_admin'), AnalyticsController.getDashboardOverview);
router.get("/platform/health", requireRole('super_admin'), AnalyticsController.getPlatformHealth);

// Sales Analytics (Platform Wide)
router.get("/sales/by-tier", requireRole('super_admin'), AnalyticsController.getSalesByTier);
router.get("/sales/trending", requireRole('super_admin'), AnalyticsController.getTrendingInsights);
router.get("/sales/top-companies", requireRole('super_admin'), AnalyticsController.getTopCompanies);

// Company Analytics
router.get("/companies/status", requireRole('super_admin'), AnalyticsController.getCompanyStatusStats);
router.get("/companies/recent", requireRole('super_admin'), AnalyticsController.getRecentCompanies);
router.get("/companies/tiers", requireRole('super_admin'), AnalyticsController.getTierDistribution);

// Legacy/Raw
router.get("/events/types", requireRole('super_admin'), AnalyticsController.getEventTypes);
router.get("/stats", requireRole('super_admin'), AnalyticsController.getEventStats);


// ==========================================
// 2. Company Reports (Company Admin & Super Admin)
// ==========================================
// Note: Company Admins can access these but should filter by ?companyId=...
// The Controller supports filtering. For stricter tenancy, use requireCompanyAccess()
// on specific routes if companyID is mandatory.

const reportRoles = ['super_admin', 'company_admin'];

// Sales Reports
router.get("/reports/sales/revenue", requireRole(reportRoles), ReportController.getRevenueReport);
router.get("/reports/sales/payment-methods", requireRole(reportRoles), ReportController.getPaymentMethodStats);
router.get("/reports/sales/payment-methods/best", requireRole(reportRoles), ReportController.getBestPaymentMethod);

// Product Reports
router.get("/reports/products/top", requireRole(reportRoles), ReportController.getTopProducts);
router.get("/reports/products/returns", requireRole(reportRoles), ReportController.getReturnRates);

// Customer Reports
router.get("/reports/customers/acquisition", requireRole(reportRoles), ReportController.getNewCustomerStats);
router.get("/reports/customers/active", requireRole(reportRoles), ReportController.getActiveUsers);
router.get("/reports/customers/top", requireRole(reportRoles), ReportController.getTopCustomers);
router.get("/reports/categories/trending", requireRole(reportRoles), ReportController.getTrendingCategories);

// Shop & Employee Reports
router.get("/reports/shops/performance", requireRole(reportRoles), ReportController.getShopPerformance);
router.get("/reports/employees/performance", requireRole(reportRoles), ReportController.getEmployeePerformance);

// Financial Reports
router.get("/reports/sales/profitability", requireRole(reportRoles), ReportController.getProfitabilityReport);

// Inventory Reports
router.get("/reports/inventory/health", requireRole(reportRoles), ReportController.getInventoryHealth);
router.get("/reports/inventory/movement", requireRole(reportRoles), ReportController.getStockMovementStats);

router.get("/reports/export", requireRole(reportRoles), ReportController.exportReport);

module.exports = router;
