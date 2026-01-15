const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

// 📊 Report Tab Endpoints
router.get('/general', reportController.getGeneralReport);
router.get('/inventory', reportController.getInventoryReport);
router.get('/sales', reportController.getSalesReport);
router.get('/debts', reportController.getDebtsReport);
router.get('/payments', reportController.getPaymentsReport);
router.get('/staff', reportController.getStaffReport);
router.get('/branches', reportController.getBranchesReport);

module.exports = router;
