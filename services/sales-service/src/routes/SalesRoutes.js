// routes/salesRoutes.js
const express = require("express");
const router = express.Router();
const salesController = require("../controllers/SalesController");

router.post("/", salesController.createSale); // Create Sale + Invoice
router.get("/:id", salesController.getSale); // Get Sale details
router.post("/return", salesController.createReturn); // Refund
router.get("/", salesController.listSales); // List all sales

module.exports = router;
