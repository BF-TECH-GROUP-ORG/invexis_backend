
const express = require("express");
const productRoutes = require("./productRoutes");
const inventoryAdjustmentRoutes = require("./inventoryAdjustmentRoutes");
const reportRoutes = require("./reportRoutes");
const dashboardConfigRoutes = require("./dashboardConfigRoutes");
const discountRoutes = require("./discountRoutes");
const alertRoutes = require("./alertRoutes");
const categoryRoutes = require("./categoryRoutes");
const stockRoutes = require("./stockRoutes");
const organizationRoutes = require("./organizationRoutes");


const router = express.Router();

router.get("/", (req, res) => {
  res.json({ message: "inventory service routed to gateway" });
});

// Legacy routes (keep for backward compatibility)
router.use("/v1/products", productRoutes);
router.use("/v1/discounts", discountRoutes);
router.use("/v1/alerts", alertRoutes);
router.use("/v1/categories", categoryRoutes);
router.use("/v1/report", reportRoutes);
router.use("/v1/inventory-adjustment", inventoryAdjustmentRoutes);
router.use("/v1/stock", stockRoutes);


// NEW: Advanced professional reporting (consolidated)
router.use("/v1/reports", reportRoutes);

// NEW: Dashboard configuration and customization
router.use("/v1/dashboard", dashboardConfigRoutes);

// NEW: Organization routes (Company and Shop management)
router.use("/v1", organizationRoutes);

module.exports = router