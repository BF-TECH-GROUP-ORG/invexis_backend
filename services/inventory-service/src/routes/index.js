
const express = require("express");
const productRoutes = require("./productRoutes");
const inventoryAdjustmentRoutes = require("./inventoryAdjustmentRoutes");
const reportRoutes = require("./reportRoutes");
const dashboardConfigRoutes = require("./dashboardConfigRoutes");
const discountRoutes = require("./discountRoutes");
const alertRoutes = require("./alertRoutes");
const categoryRoutes = require("./categoryRoutes");
const analyticsRoutes = require("./analyticsRoutes");

const stockRoutes = require("./stockRoutes");
const organizationRoutes = require("./organizationRoutes");
const shopInventoryRoutes = require("./shopInventoryRoutes");
const stocktakeRoutes = require("./stocktakeRoutes");

const { authenticateToken, requireRole } = require('/app/shared/middlewares/auth/production-auth');


const router = express.Router();

router.get("/", (req, res) => {
  res.json({ message: "inventory service routed to gateway" });
});

// Legacy routes (keep for backward compatibility)
router.use("/v1/products", authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), productRoutes);
router.use("/v1/discounts", authenticateToken, requireRole(['super_admin', 'company_admin']), discountRoutes);
router.use("/v1/alerts", authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), alertRoutes);
router.use("/v1/categories", authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), categoryRoutes);
router.use("/v1/report", authenticateToken, requireRole(['super_admin', 'company_admin']), reportRoutes);
router.use("/v1/inventory-adjustment", authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), inventoryAdjustmentRoutes);

// New modularized stock routes
router.use("/v1/stock", authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), stockRoutes);


// NEW: Advanced professional reporting (consolidated)
router.use("/v1/reports", authenticateToken, requireRole(['super_admin', 'company_admin']), reportRoutes);

// NEW: Analytics - profit, margin, forecasting
router.use("/v1/analytics", authenticateToken, requireRole(['super_admin', 'company_admin']), analyticsRoutes);

// NEW: Dashboard configuration and customization
router.use("/v1/dashboard", authenticateToken, requireRole(['super_admin', 'company_admin']), dashboardConfigRoutes);

// NEW: Organization routes (Company and Shop management)
router.use("/v1", authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), organizationRoutes);

// NEW: Shop inventory management
router.use("/v1/shop-inventory", authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), shopInventoryRoutes);

// NEW: Audit & Stocktake management
router.use("/v1/stocktake", authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), stocktakeRoutes);

module.exports = router