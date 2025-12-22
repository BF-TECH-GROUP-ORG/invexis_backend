const express = require('express');
const                 router = express.Router();
const {
    getProductByScan,
    stockIn,
    stockOut,
    bulkStockIn,
    bulkStockOut,
    getAllStockChanges,
    getStockChangeById,
    createStockChange,
    getStockHistory,
    getStockChangesByUser,
    getStockChangesSummaryByUser,
    getCompanyStockChanges,
    getShopStockChanges
} = require('../controllers/stockController');

const { authenticateToken, requireRole } = require('/app/shared/middlewares/auth/production-auth');
// ==================== STOCK OPERATIONS ====================

/**
 * @route   POST /v1/stock/lookup
 * @desc    Lookup product by scanned QR/Barcode data
 * @access  Private
 */
router.post('/lookup', authenticateToken, requireRole(['super_admin','company_admin' ,'worker']), getProductByScan);

/**
 * @route   POST /v1/stock/in
 * @desc    Add inventory (restocking)
 * @access  Private
 */
router.post('/in', authenticateToken, requireRole(['super_admin','company_admin' ,'worker']), stockIn);

/**
 * @route   POST /v1/stock/out
 * @desc    Remove inventory (sales, damage, etc.)
 * @access  Private
 */
router.post('/out', authenticateToken, requireRole(['super_admin','company_admin' ,'worker']), stockOut);

/**
 * @route   POST /v1/stock/bulk-in
 * @desc    Bulk add inventory for multiple products
 * @access  Private
 */
router.post('/bulk-in', authenticateToken, requireRole(['super_admin','company_admin' ,'worker']), bulkStockIn);

/**
 * @route   POST /v1/stock/bulk-out
 * @desc    Bulk remove inventory for multiple products
 * @access  Private
 */
router.post('/bulk-out', authenticateToken, requireRole(['super_admin','company_admin' ,'worker']), bulkStockOut);

// ==================== STOCK CHANGE HISTORY & CRUD ====================

/**
 * @route   GET /v1/stock/changes
 * @desc    Get all stock changes
 * @access  Private
 */
router.get('/changes', authenticateToken, requireRole(['super_admin','company_admin' ,'worker']), getAllStockChanges);

/**
 * @route   GET /v1/stock/history
 * @desc    Get stock history for a product
 * @access  Private
 */
router.get('/history', authenticateToken, requireRole(['super_admin','company_admin' ,'worker']), getStockHistory);

/**
 * @route   GET /v1/stock/changes/:id
 * @desc    Get stock change by ID
 * @access  Private
 */
router.get('/changes/:id', authenticateToken, requireRole(['super_admin','company_admin' ,'worker']), getStockChangeById);

/**
 * @route   POST /v1/stock/changes
 * @desc    Create a stock change manually
 * @access  Private
 */
router.post('/changes', authenticateToken, requireRole(['super_admin','company_admin' ,'worker']), createStockChange);

// ==================== USER-SPECIFIC STOCK TRACKING ====================

/**
 * @route   GET /v1/stock/user-changes
 * @desc    Get stock changes made by specific user in company/shop
 * @access  Private
 * @query   userId (required), companyId (required), shopId (optional), changeType (optional), startDate (optional), endDate (optional), page (optional), limit (optional)
 */
router.get('/user-changes', authenticateToken, requireRole(['super_admin','company_admin' ,'manager', 'worker']), getStockChangesByUser);

/**
 * @route   GET /v1/stock/user-summary
 * @desc    Get summary statistics for user stock changes
 * @access  Private
 * @query   userId (required), companyId (required), shopId (optional), startDate (optional), endDate (optional)
 */
router.get('/user-summary', authenticateToken, requireRole(['super_admin','company_admin' ,'manager', 'worker']), getStockChangesSummaryByUser);

// ==================== COMPANY & SHOP-WIDE STOCK TRACKING ====================

/**
 * @route   GET /v1/stock/company-changes
 * @desc    Get ALL stock changes across entire company (all shops, all users)
 * @access  Private
 * @query   companyId (required), changeType (optional), startDate (optional), endDate (optional), page (optional), limit (optional)
 */
router.get('/company-changes', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), getCompanyStockChanges);

/** 
 * @route   GET /v1/stock/shop-changes
 * @desc    Get ALL stock changes for specific shop (all users in that shop)
 * @access  Private
 * @query   companyId (required), shopId (required), changeType (optional), userId (optional), startDate (optional), endDate (optional), page (optional), limit (optional)
 */
router.get('/shop-changes', authenticateToken, requireRole(['super_admin','company_admin', 'worker']), getShopStockChanges);

module.exports = router;