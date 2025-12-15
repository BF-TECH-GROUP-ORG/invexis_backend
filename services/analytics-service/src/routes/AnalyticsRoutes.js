const express = require("express");
const router = express.Router();
const AnalyticsController = require("../controllers/AnalyticsController");

const ReportController = require("../controllers/ReportController");

// Dashboard & Health
router.get("/dashboard/summary", AnalyticsController.getDashboardSummary);
router.get("/platform/health", AnalyticsController.getPlatformHealth);

// Legacy/Raw
router.get("/events/types", AnalyticsController.getEventTypes);
router.get("/stats", AnalyticsController.getEventStats);


// Enhanced Reports
router.get("/reports/sales/revenue", ReportController.getRevenueReport);
router.get("/reports/sales/payment-methods", ReportController.getPaymentMethodStats);
router.get("/reports/products/top", ReportController.getTopProducts);
router.get("/reports/products/returns", ReportController.getReturnRates);
router.get("/reports/customers/acquisition", ReportController.getNewCustomerStats);
router.get("/reports/customers/active", ReportController.getActiveUsers);
router.get("/reports/customers/top", ReportController.getTopCustomers);
router.get("/reports/categories/trending", ReportController.getTrendingCategories);

// Shop & Employee Reports
router.get("/reports/shops/performance", ReportController.getShopPerformance);
router.get("/reports/employees/performance", ReportController.getEmployeePerformance);

// Financial Reports
router.get("/reports/sales/profitability", ReportController.getProfitabilityReport);

// Inventory Reports
router.get("/reports/inventory/health", ReportController.getInventoryHealth);

router.get("/reports/export", ReportController.exportReport);

module.exports = router;
