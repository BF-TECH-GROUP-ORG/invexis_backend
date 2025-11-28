const express = require('express');
const router = express.Router();
const {
    getProductByScan,
    stockIn,
    stockOut,
    bulkStockIn,
    bulkStockOut,
    getAllStockChanges,
    getStockChangeById,
    createStockChange,
    getStockHistory
} = require('../controllers/stockController');

// ==================== STOCK OPERATIONS ====================

/**
 * @route   POST /v1/stock/lookup
 * @desc    Lookup product by scanned QR/Barcode data
 * @access  Private
 */
router.post('/lookup', getProductByScan);

/**
 * @route   POST /v1/stock/in
 * @desc    Add inventory (restocking)
 * @access  Private
 */
router.post('/in', stockIn);

/**
 * @route   POST /v1/stock/out
 * @desc    Remove inventory (sales, damage, etc.)
 * @access  Private
 */
router.post('/out', stockOut);

/**
 * @route   POST /v1/stock/bulk-in
 * @desc    Bulk add inventory for multiple products
 * @access  Private
 */
router.post('/bulk-in', bulkStockIn);

/**
 * @route   POST /v1/stock/bulk-out
 * @desc    Bulk remove inventory for multiple products
 * @access  Private
 */
router.post('/bulk-out', bulkStockOut);

// ==================== STOCK CHANGE HISTORY & CRUD ====================

/**
 * @route   GET /v1/stock/changes
 * @desc    Get all stock changes
 * @access  Private
 */
router.get('/changes', getAllStockChanges);

/**
 * @route   GET /v1/stock/history
 * @desc    Get stock history for a product
 * @access  Private
 */
router.get('/history', getStockHistory);

/**
 * @route   GET /v1/stock/changes/:id
 * @desc    Get stock change by ID
 * @access  Private
 */
router.get('/changes/:id', getStockChangeById);

/**
 * @route   POST /v1/stock/changes
 * @desc    Create a stock change manually
 * @access  Private
 */
router.post('/changes', createStockChange);

module.exports = router;
