const express = require("express");
const router = express.Router();
const salesController = require("../controllers/SalesController");

// Create sale
router.post("/", salesController.createSale);

// Returns
router.post("/return", salesController.createReturn);

// Reports & trends (specific routes first)
router.get("/reports/sales", salesController.salesReport);
router.get(
  "/reports/sales/customer/:customerId",
  salesController.customerSalesReport
);
 
// Trends
router.get("/trends/top-products", salesController.topSellingProducts);
router.get("/trends/revenue", salesController.revenueTrend);

// Track purchases by customer (specific route)
router.get("/customer/:customerId", salesController.getCustomerPurchases);

// List all sales (company scoped)
router.get("/", salesController.listSales);

// Single sale operations - place last to avoid shadowing more specific routes
router.get("/:id", salesController.getSale);
router.put("/:id", salesController.updateSale);
router.delete("/:id", salesController.deleteSale);

module.exports = router;
