const express = require('express');
const router = express.Router();

const DocumentController = require('../controllers/DocumentController');
const SalesController = require('../controllers/SalesController');
const DebtController = require('../controllers/DebtController');
const FinanceController = require('../controllers/FinanceController');
const InventoryController = require('../controllers/InventoryController');
const PerformanceController = require('../controllers/PerformanceController');
const PaymentController = require('../controllers/PaymentController');

// --- 1. Universal Search & Lookup ---
router.get('/search', DocumentController.searchAll);
router.get('/:id', DocumentController.getDocumentById);

// --- 2. Sales Domain ---

// Invoices
router.get('/sales/company/:companyId/invoices', SalesController.getCompanyInvoices);
router.get('/sales/shop/:shopId/invoices', SalesController.getShopInvoices);

// Reports
router.get('/sales/company/:companyId/reports', SalesController.getCompanyReports);
router.get('/sales/shop/:shopId/reports', SalesController.getShopReports);

// --- 3. Debt Domain ---
// Receipts
router.get('/debt/company/:companyId/receipts', DebtController.getCompanyReceipts);
router.get('/debt/shop/:shopId/receipts', DebtController.getShopReceipts);

// Reports
router.get('/debt/company/:companyId/reports', DebtController.getCompanyReports);
router.get('/debt/shop/:shopId/reports', DebtController.getShopReports);

// --- 4. Finance Domain ---
router.get('/finance/company/:companyId/reports', FinanceController.getCompanyReports);
router.get('/finance/shop/:shopId/reports', FinanceController.getShopReports);

// --- 5. Inventory (Media & Reports) ---
// Media
router.get('/inventory/company/:companyId/media', InventoryController.getCompanyMedia);
router.get('/inventory/shop/:shopId/media', InventoryController.getShopMedia);

// Reports
router.get('/inventory/company/:companyId/reports', InventoryController.getCompanyReports);
router.get('/inventory/shop/:shopId/reports', InventoryController.getShopReports);

// --- 6. Performance Domain ---
router.get('/performance/company/:companyId/reports', PerformanceController.getCompanyReports);
router.get('/performance/shop/:shopId/reports', PerformanceController.getShopReports);

// --- 7. Payment Logs ---
router.get('/payment/company/:companyId/logs', PaymentController.getCompanyLogs);
router.get('/payment/shop/:shopId/logs', PaymentController.getShopLogs);

module.exports = router;
