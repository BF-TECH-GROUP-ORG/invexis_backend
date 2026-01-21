const express = require('express');
const router = express.Router({ mergeParams: true });

const {
    // Company Level
    getCompanyOverview,
    getCompanyProducts,
    getProductBySku,
    getCompanyStockChanges,
    getCompanyAlerts,
    getCompanyAdjustments,
    getCompanyReports,
    getProductReport,
    getCategoryReport,
    getDailyReport,
    createDailySummaryAlert,
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

    // Transfer History
    getProductTransferHistory,
    getCompanyTransfers,
    getCompanyTransferById,
    getTransferredProductCopies,

    // Transfer Operations
    transferStockBetweenShops,
    transferProductCrossCompany,

    // Bulk Transfer Operations
    bulkTransferIntraCompany,
    bulkTransferCrossCompany
} = require('../controllers/organizationController');


const { authenticateToken, requireRole } = require('/app/shared/middlewares/auth/production-auth');


// Transfer functions are in organizationController now

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
router.get('/companies/:companyId/products', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), getCompanyProducts);
// Get product by SKU
router.get('/companies/:companyId/products/sku/:sku', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), getProductBySku);

/**
 * @route   GET /api/v1/companies/:companyId/stock-changes
 * @desc    Get all stock changes for a company
 * @access  Private
 */
router.get('/companies/:companyId/stock-changes', authenticateToken, requireRole(['super_admin', 'company_admin']), getCompanyStockChanges);

/**
 * @route   GET /api/v1/companies/:companyId/alerts
 * @desc    Get all alerts for a company
 * @access  Private
 */
router.get('/companies/:companyId/alerts', authenticateToken, requireRole(['super_admin', 'company_admin']), getCompanyAlerts);

/**
 * @route   GET /api/v1/companies/:companyId/adjustments
 * @desc    Get all inventory adjustments for a company
 * @access  Private
 */
router.get('/companies/:companyId/adjustments', authenticateToken, requireRole(['super_admin', 'company_admin']), getCompanyAdjustments);

/**
 * @route   GET /api/v1/companies/:companyId/reports
 * @desc    Get comprehensive inventory reports for a company
 * @access  Private
 */
router.get('/companies/:companyId/reports', authenticateToken, requireRole(['super_admin', 'company_admin']), getCompanyReports);
// Product-level report
router.get('/companies/:companyId/products/:productId/report', authenticateToken, requireRole(['super_admin', 'company_admin']), getProductReport);

// Category-level report
router.get('/companies/:companyId/categories/:categoryId/report', authenticateToken, requireRole(['super_admin', 'company_admin']), getCategoryReport);

// Daily reports
router.get('/companies/:companyId/reports/daily', getDailyReport);
router.post('/companies/:companyId/reports/daily/summary', createDailySummaryAlert);

/**
 * @route   GET /api/v1/companies/:companyId/low-stock
 * @desc    Get all low-stock products for a company
 * @access  Private
 */
router.get('/companies/:companyId/low-stock', authenticateToken, requireRole(['super_admin', 'company_admin']), getCompanyLowStockProducts);

/**
 * @route   GET /api/v1/companies/:companyId/inventory-summary
 * @desc    Get inventory summary for a company
 * @access  Private
 */
router.get('/companies/:companyId/inventory-summary', authenticateToken, requireRole(['super_admin', 'company_admin']), getCompanyInventorySummary);

/**
 * @route   GET /api/v1/companies/:companyId/shops
 * @desc    Get all shops in a company with inventory stats
 * @access  Private
 */
router.get('/companies/:companyId/shops', authenticateToken, requireRole(['super_admin', 'company_admin']), getCompanyShops);


// ==================== SHOP ROUTES ====================

/**
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/overview
 * @desc    Get shop-specific inventory overview
 * @access  Private
 */
router.get('/companies/:companyId/shops/:shopId/overview', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), getShopOverview);

/**
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/products
 * @desc    Get all products in a specific shop
 * @access  Private
 */
router.get('/companies/:companyId/shops/:shopId/products', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), getShopProducts);

/**
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/products/:productId/inventory
 * @desc    Get detailed inventory for a product in a specific shop
 * @access  Private
 */
router.get('/companies/:companyId/shops/:shopId/products/:productId/inventory', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), getShopProductInventory);

/**
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/stock-changes
 * @desc    Get all stock changes for a specific shop
 * @access  Private
 */
router.get('/companies/:companyId/shops/:shopId/stock-changes', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), getShopStockChanges);

/**
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/alerts
 * @desc    Get all alerts for a specific shop
 * @access  Private
 */
router.get('/companies/:companyId/shops/:shopId/alerts', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), getShopAlerts);

/**
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/adjustments
 * @desc    Get all inventory adjustments for a specific shop
 * @access  Private
 */
router.get('/companies/:companyId/shops/:shopId/adjustments', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), getShopAdjustments);

/**
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/inventory-summary
 * @desc    Get inventory summary for a shop
 * @access  Private
 */
router.get('/companies/:companyId/shops/:shopId/inventory-summary', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), getShopInventorySummary);

/**
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/low-stock
 * @desc    Get all low-stock products in a specific shop
 * @access  Private
 */
router.get('/companies/:companyId/shops/:shopId/low-stock', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), getShopLowStockProducts);

/**
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/report
 * @desc    Get detailed inventory report for a shop
 * @access  Private
 */
router.get('/companies/:companyId/shops/:shopId/report', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), getShopReport);

/**
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/top-sellers
 * @desc    Get top-selling products for a specific shop
 * @access  Private
 */
router.get('/companies/:companyId/shops/:shopId/top-sellers', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), getShopTopSellers);

/**
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/analytics
 * @desc    Get advanced analytics for a shop
 * @access  Private
 */
router.get('/companies/:companyId/shops/:shopId/analytics', authenticateToken, requireRole(['super_admin', 'company_admin']), getShopAdvancedAnalytics);

/**
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/comparison
 * @desc    Get product comparison data across shops
 * @access  Private
 */
router.get('/companies/:companyId/shops/:shopId/comparison', authenticateToken, requireRole(['super_admin', 'company_admin']), getProductComparison);

/**
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/performance
 * @desc    Get shop performance metrics
 * @access  Private
 */
router.get('/companies/:companyId/shops/:shopId/performance', authenticateToken, requireRole(['super_admin', 'company_admin']), getShopPerformanceMetrics);

/**
 * @route   POST /api/v1/companies/:companyId/shops/:shopId/allocate
 * @desc    Allocate stock to a shop
 * @access  Private
 */
router.post('/companies/:companyId/shops/:shopId/allocate', authenticateToken, requireRole(['super_admin', 'company_admin']), allocateInventoryToShop);

/**
 * @route   POST /api/v1/companies/:companyId/shops/:shopId/transfer
 * @desc    Transfer stock from one shop to another (single product)
 * @access  Private
 */
router.post('/companies/:companyId/shops/:shopId/transfer', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), transferStockBetweenShops);

/**
 * @route   POST /api/v1/companies/:companyId/shops/:shopId/bulk-transfer
 * @desc    Bulk transfer multiple products between shops in same company
 * @access  Private
 * @body    { transfers: [{ productId, quantity }], toShopId, reason, userId, notes }
 */
router.post('/companies/:companyId/shops/:shopId/bulk-transfer', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), bulkTransferIntraCompany);

// ==================== CROSS-COMPANY ROUTES ====================

/**
 * @route   POST /api/v1/companies/:companyId/shops/:shopId/products/:productId/cross-company-transfer
 * @desc    Transfer product (with full details) from one shop to another shop in different company
 * @access  Private
 */
router.post('/companies/:companyId/shops/:shopId/products/:productId/cross-company-transfer', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), transferProductCrossCompany);

/**
 * @route   POST /api/v1/companies/:companyId/shops/:shopId/bulk-cross-company-transfer
 * @desc    Bulk transfer multiple products across companies with automatic category creation
 * @access  Private
 * @body    { transfers: [{ productId, quantity, pricingOverride }], toCompanyId, toShopId, reason, userId, notes }
 */
router.post('/companies/:companyId/shops/:shopId/bulk-cross-company-transfer', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), bulkTransferCrossCompany);

/**
 * @route   GET /api/v1/companies/:companyId/products/:productId/transfer-history
 * @desc    Get complete transfer history of a product (all cross-company transfers)
 * @access  Private
 */
router.get('/companies/:companyId/products/:productId/transfer-history', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), getProductTransferHistory);

/**
 * @route   GET /api/v1/companies/:companyId/transfers
 * @desc    Get complete transfer history for a company (inbound & outbound)
 * @access  Private
 */
router.get('/companies/:companyId/transfers', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), getCompanyTransfers);

/**
 * @route   GET /api/v1/companies/:companyId/transfers/:transferId
 * @desc    Get detailed transfer information by ID
 * @access  Private
 */
router.get('/companies/:companyId/transfers/:transferId', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), getCompanyTransferById);

/**
 * @route   GET /api/v1/companies/:companyId/products/:productId/transferred-copies
 * @desc    Get all copies of a product that were transferred to other companies
 * @access  Private
 */
router.get('/companies/:companyId/products/:productId/transferred-copies', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), getTransferredProductCopies);

// ==================== SMART REDISTRIBUTION ROUTES ====================

// Stock redistribution routes removed - use direct transfer endpoints instead
/*
router.get('/companies/:companyId/stock-redistribution/suggestions', getStockRedistributionSuggestions);
router.post('/companies/:companyId/stock-redistribution/auto-transfer', autoTransferStock);
*/

// Cross-company opportunities route removed - use direct transfer endpoints
// router.post('/cross-company/transfer-opportunities', getCrossCompanyOpportunities);

module.exports = router;
