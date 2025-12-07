const express = require('express');
const router = express.Router({ mergeParams: true });

const {
    // Company Level
    getCompanyOverview,
    getCompanyProducts,
    getCompanyStockChanges,
    getCompanyAlerts,
    getCompanyAdjustments,
    getCompanyReports,
    getCompanyLowStockProducts,
    getCompanyInventorySummary,
    getCompanyShops,

    // Shop Level
    getShopOverview,
    getShopProducts,
    getShopProductInventory,
    getShopStockChanges,
    getShopAlerts,
    getShopAdjustments,
    getShopInventorySummary,
    getShopLowStockProducts,
    getShopReport,
    getShopTopSellers,
    getShopAdvancedAnalytics,
    getProductComparison,
    getShopPerformanceMetrics,
    allocateInventoryToShop,
    transferStockBetweenShops,

    // Cross-Company
    transferProductCrossCompany,
    getProductTransferHistory,
    getTransferredProductCopies
} = require('../controllers/organizationController');

// ==================== MIDDLEWARE ====================

// Middleware to extract and validate companyId
router.use('/companies/:companyId', (req, res, next) => {
    const { companyId } = req.params || req.query || req.body;
    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: 'companyId is required in URL path'
        });
    }
    req.companyId = companyId;
    next();
});

// Middleware to extract and validate shopId for shop-specific routes
router.use('/companies/:companyId/shops/:shopId', (req, res, next) => {
    const { shopId } = req.params;
    if (!shopId) {
        return res.status(400).json({
            success: false,
            message: 'shopId is required in URL path'
        });
    }
    req.shopId = shopId;
    next();
});

// ==================== COMPANY ROUTES ====================

/**
 * @route   GET /api/v1/companies/:companyId/overview
 * @desc    Get company-wide inventory overview
 * @access  Private
 */
router.get('/companies/:companyId/overview', getCompanyOverview);

/**
 * @route   GET /api/v1/companies/:companyId/products
 * @desc    Get all products for a company
 * @access  Private
 */
router.get('/companies/:companyId/products', getCompanyProducts);

/**
 * @route   GET /api/v1/companies/:companyId/stock-changes
 * @desc    Get all stock changes for a company
 * @access  Private
 */
router.get('/companies/:companyId/stock-changes', getCompanyStockChanges);

/**
 * @route   GET /api/v1/companies/:companyId/alerts
 * @desc    Get all alerts for a company
 * @access  Private
 */
router.get('/companies/:companyId/alerts', getCompanyAlerts);

/**
 * @route   GET /api/v1/companies/:companyId/adjustments
 * @desc    Get all inventory adjustments for a company
 * @access  Private
 */
router.get('/companies/:companyId/adjustments', getCompanyAdjustments);

/**
 * @route   GET /api/v1/companies/:companyId/reports
 * @desc    Get comprehensive inventory reports for a company
 * @access  Private
 */
router.get('/companies/:companyId/reports', getCompanyReports);

/**
 * @route   GET /api/v1/companies/:companyId/low-stock
 * @desc    Get all low-stock products for a company
 * @access  Private
 */
router.get('/companies/:companyId/low-stock', getCompanyLowStockProducts);

/**
 * @route   GET /api/v1/companies/:companyId/inventory-summary
 * @desc    Get inventory summary for a company
 * @access  Private
 */
router.get('/companies/:companyId/inventory-summary', getCompanyInventorySummary);

/**
 * @route   GET /api/v1/companies/:companyId/shops
 * @desc    Get all shops in a company with inventory stats
 * @access  Private
 */
router.get('/companies/:companyId/shops', getCompanyShops);


// ==================== SHOP ROUTES ====================

/**
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/overview
 * @desc    Get shop-specific inventory overview
 * @access  Private
 */
router.get('/companies/:companyId/shops/:shopId/overview', getShopOverview);

/**
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/products
 * @desc    Get all products in a specific shop
 * @access  Private
 */
router.get('/companies/:companyId/shops/:shopId/products', getShopProducts);

/**
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/products/:productId/inventory
 * @desc    Get detailed inventory for a product in a specific shop
 * @access  Private
 */
router.get('/companies/:companyId/shops/:shopId/products/:productId/inventory', getShopProductInventory);

/**
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/stock-changes
 * @desc    Get all stock changes for a specific shop
 * @access  Private
 */
router.get('/companies/:companyId/shops/:shopId/stock-changes', getShopStockChanges);

/**
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/alerts
 * @desc    Get all alerts for a specific shop
 * @access  Private
 */
router.get('/companies/:companyId/shops/:shopId/alerts', getShopAlerts);

/**
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/adjustments
 * @desc    Get all inventory adjustments for a specific shop
 * @access  Private
 */
router.get('/companies/:companyId/shops/:shopId/adjustments', getShopAdjustments);

/**
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/inventory-summary
 * @desc    Get inventory summary for a shop
 * @access  Private
 */
router.get('/companies/:companyId/shops/:shopId/inventory-summary', getShopInventorySummary);

/**
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/low-stock
 * @desc    Get all low-stock products in a specific shop
 * @access  Private
 */
router.get('/companies/:companyId/shops/:shopId/low-stock', getShopLowStockProducts);

/**
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/report
 * @desc    Get detailed inventory report for a shop
 * @access  Private
 */
router.get('/companies/:companyId/shops/:shopId/report', getShopReport);

/**
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/top-sellers
 * @desc    Get top-selling products for a specific shop
 * @access  Private
 */
router.get('/companies/:companyId/shops/:shopId/top-sellers', getShopTopSellers);

/**
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/analytics
 * @desc    Get advanced analytics for a shop
 * @access  Private
 */
router.get('/companies/:companyId/shops/:shopId/analytics', getShopAdvancedAnalytics);

/**
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/comparison
 * @desc    Get product comparison data across shops
 * @access  Private
 */
router.get('/companies/:companyId/shops/:shopId/comparison', getProductComparison);

/**
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/performance
 * @desc    Get shop performance metrics
 * @access  Private
 */
router.get('/companies/:companyId/shops/:shopId/performance', getShopPerformanceMetrics);

/**
 * @route   POST /api/v1/companies/:companyId/shops/:shopId/allocate
 * @desc    Allocate stock to a shop
 * @access  Private
 */
router.post('/companies/:companyId/shops/:shopId/allocate', allocateInventoryToShop);

/**
 * @route   POST /api/v1/companies/:companyId/shops/:shopId/transfer
 * @desc    Transfer stock from one shop to another
 * @access  Private
 */
router.post('/companies/:companyId/shops/:shopId/transfer', transferStockBetweenShops);

// ==================== CROSS-COMPANY ROUTES ====================

/**
 * @route   POST /api/v1/companies/:companyId/shops/:shopId/products/:productId/cross-company-transfer
 * @desc    Transfer product (with full details) from one shop to another shop in different company
 * @access  Private
 */
router.post('/companies/:companyId/shops/:shopId/products/:productId/cross-company-transfer', transferProductCrossCompany);

/**
 * @route   GET /api/v1/companies/:companyId/products/:productId/transfer-history
 * @desc    Get complete transfer history of a product (all cross-company transfers)
 * @access  Private
 */
router.get('/companies/:companyId/products/:productId/transfer-history', getProductTransferHistory);

/**
 * @route   GET /api/v1/companies/:companyId/products/:productId/transferred-copies
 * @desc    Get all copies of a product that were transferred to other companies
 * @access  Private
 */
router.get('/companies/:companyId/products/:productId/transferred-copies', getTransferredProductCopies);

module.exports = router;
