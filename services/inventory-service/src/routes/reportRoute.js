const express = require('express');
const asyncHandler = require('express-async-handler');
const authMiddleware = require('../middleware/auth');
const ProductReport = require('../models/ProductReport');
const DailyReport = require('../models/DailyReport');
const logger = require('../utils/logger');

const router = express.Router();

// Get all daily reports for a company
router.get('/daily', authMiddleware, asyncHandler(async (req, res) => {
  const reports = await DailyReport.find({ companyId: req.user.companyId });
  res.json({ success: true, data: reports });
}));

// Get all product reports for a company
router.get('/products', authMiddleware, asyncHandler(async (req, res) => {
  const reports = await ProductReport.find({ companyId: req.user.companyId });
  res.json({ success: true, data: reports });
}));

module.exports = router;