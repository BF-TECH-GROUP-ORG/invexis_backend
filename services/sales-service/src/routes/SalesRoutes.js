const express = require("express");
const router = express.Router();
const salesController = require("../controllers/SalesController");
// cmd
// Apply rate limiting to all sales routes
// router.use(
//   checkRateLimits({
//     limits: { basic: 100, mid: 500, pro: 2000 },
//     windowMs: 60000,
//     companyIdSource: "body",
//     companyIdField: "company_id",
//   })
// );

// Apply subscription validation to all modifying operations
// router.use((req, res, next) => {
//   // Only check subscription for POST, PUT, DELETE operations
//   if (["POST", "PUT", "DELETE"].includes(req.method)) {
//     return checkSubscriptionActive({
//       companyIdSource: "body",
//       companyIdField: "company_id",
//     })(req, res, next);
//   }
//   next();
// });

// Create sale

router.post(
  "/",
  // checkFeatureAccess("sales", "internalStaffSales"),
  salesController.createSale
);

// Returns
router.post(
  "/return",
  // checkFeatureAccess("sales", "internalStaffSales"),
  salesController.createReturn
);

// Reports & trends (specific routes first)
router.get("/reports/sales", salesController.salesReport);
router.get(
  "/reports/sales/customer/:knownUserId",
  salesController.customerSalesReport
);

// Trends - Pro tier only for advanced analytics
router.get(
  "/trends/top-products",
  // checkSubscriptionActive({ companyIdSource: "query", companyIdField: "company_id" }),
  // checkSubscriptionTier("pro"),
  salesController.topSellingProducts
);

router.get(
  "/trends/revenue",
  // checkSubscriptionActive({ companyIdSource: "query", companyIdField: "company_id" }),
  // checkSubscriptionTier("pro"),
  salesController.revenueTrend
);

// Track purchases by customer (specific route)
router.get(
  "/customer/:knownUserId",
  // checkSubscriptionActive({ companyIdSource: "query", companyIdField: "company_id" }),
  salesController.getCustomerPurchases
);

// List all sales (company scoped)
router.get(
  "/",
  // checkSubscriptionActive({ companyIdSource: "query", companyIdField: "company_id" }),
  salesController.listSales
);

// Single sale operations - place last to avoid shadowing more specific routes
router.get(
  "/:id",
  // checkSubscriptionActive({ companyIdSource: "query", companyIdField: "company_id" }),
  salesController.getSale
);

router.put(
  "/:id",
  // checkFeatureAccess("sales", "internalStaffSales"),
  salesController.updateSale
);

// Update sale contents (customer info + items)
router.put("/:id/contents", salesController.updateSaleContents);

router.delete(
  "/:id",
  // checkFeatureAccess("sales", "internalStaffSales"),
  salesController.deleteSale
);

module.exports = router