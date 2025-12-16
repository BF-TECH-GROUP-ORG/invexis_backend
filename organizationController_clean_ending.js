// ==================== TRANSFER HISTORY OPERATIONS ====================

/**
 * @desc    Get transfer history for a product (all cross-company transfers)
 * @route   GET /api/v1/companies/:companyId/products/:productId/transfer-history
 * @access  Private
 */
const getProductTransferHistory = asyncHandler(async (req, res) => {
    const { productId } = req.params;

    validateMongoId(productId);

    // Get original product
    const originalProduct = await Product.findById(productId);

    if (!originalProduct) {
        return res.status(404).json({
            success: false,
            message: 'Product not found'
        });
    }

    // Get all stock changes related to this product (cross-company transfers)
    const transfers = await StockChange.find({
        $or: [
            {
                productId: productId,
                type: 'cross_company_transfer_out'
            },
            {
                type: 'cross_company_transfer_in'
            }
        ]
    })
        .sort({ timestamp: -1 });

    // Get audit trail from original product
    const auditTrail = originalProduct.auditTrail ? originalProduct.auditTrail.filter(
        entry => entry.action === 'cross_company_transfer_sent' || entry.action === 'cross_company_transfer_received'
    ) : [];

    res.json({
        success: true,
        data: {
            originalProductId: productId,
            originalProductName: originalProduct.name,
            originalProductSku: originalProduct.sku,
            auditTrail: auditTrail,
            stockChangeRecords: transfers,
            totalTransfers: transfers.length
        }
    });
});

/**
 * @desc    Get all transferred copies of a product across companies
 * @route   GET /api/v1/companies/:companyId/products/:productId/transferred-copies
 * @access  Private
 */
const getTransferredProductCopies = asyncHandler(async (req, res) => {
    const { productId } = req.params;

    validateMongoId(productId);

    // Get original product
    const originalProduct = await Product.findById(productId);

    if (!originalProduct) {
        return res.status(404).json({
            success: false,
            message: 'Product not found'
        });
    }

    // Find all stock changes of type "cross_company_transfer_out" for this product
    const outgoingTransfers = await StockChange.find({
        productId: productId,
        type: 'cross_company_transfer_out'
    });

    // Get the destination product IDs from audit trail
    const transferredProductIds = originalProduct.auditTrail
        ? originalProduct.auditTrail
            .filter(entry => entry.action === 'cross_company_transfer_sent')
            .map(entry => entry.destinationProductId)
        : [];

    // Fetch all transferred copies
    const transferredProducts = await Product.find({
        _id: { $in: transferredProductIds }
    }).populate('categoryId', 'name');

    // Get current stock for each transferred product
    const productsWithStock = await Promise.all(
        transferredProducts.map(async (p) => {
            const stock = await ProductStock.findOne({ productId: p._id });
            return {
                copyProductId: p._id,
                companyId: p.companyId,
                name: p.name,
                sku: p.sku,
                currentQuantity: stock ? stock.stockQty : 0,
                category: p.category,
                createdAt: p.createdAt
            };
        })
    );

    res.json({
        success: true,
        data: {
            originalProductId: productId,
            originalProductName: originalProduct.name,
            originalProductSku: originalProduct.sku,
            originalCompanyId: originalProduct.companyId,
            transferredCopies: productsWithStock,
            totalCopiesCreated: transferredProducts.length
        }
    });
});

// ==================== HELPER FUNCTIONS ====================

function generateShopRecommendations(lowStockCount, totalProducts, profitMargin, unitsSold) {
    const recommendations = [];

    if (lowStockCount > totalProducts * 0.2) {
        recommendations.push('⚠️ High low-stock items - Schedule urgent replenishment');
    }

    if (profitMargin < 20) {
        recommendations.push('📉 Profit margin below 20% - Review pricing strategy');
    }

    if (unitsSold < 50) {
        recommendations.push('🐌 Low sales velocity - Consider promotions or product mix review');
    }

    if (recommendations.length === 0) {
        recommendations.push('✅ Shop metrics look healthy');
    }

    return recommendations;
}

// ==================== EXPORTS ====================

module.exports = {
    getCompanyOverview,
    getCompanyProducts,
    getShopProducts,
    getShopOverview,
    getShopStock,
    getCompanyShops,
    getShopInventoryReport,
    getShopSalesReport,
    getShopProductsByCategory,
    getShopCategorySummary,
    transferStockBetweenShops,
    transferProductCrossCompany,
    getProductTransferHistory,
    getTransferredProductCopies
};