const express = require("express");
const router = express.Router();
const AnalyticsController = require("../controllers/AnalyticsController");

const ReportController = require("../controllers/ReportController");

router.get("/events/types", AnalyticsController.getEventTypes);
router.get("/stats", AnalyticsController.getEventStats);


// Enhanced Reports
router.get("/reports/sales/revenue", ReportController.getRevenueReport);
router.get("/reports/sales/payment-methods", ReportController.getPaymentMethodStats);
router.get("/reports/products/top", ReportController.getTopProducts);
router.get("/reports/products/returns", ReportController.getReturnRates);
router.get("/reports/customers/acquisition", ReportController.getNewCustomerStats);
router.get("/reports/customers/top", ReportController.getTopCustomers);
router.get("/reports/export", ReportController.exportReport);

module.exports = router;
