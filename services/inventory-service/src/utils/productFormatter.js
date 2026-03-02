// services/inventory-service/src/utils/productFormatter.js

const Money = require('/app/shared/utils/MoneyUtil');

/**
 * Helper to format enriched product response uniformly
 * Ensures zero duplication by explicitly excluding raw fields that are re-mapped.
 * 
 * @param {Object} product - The raw Mongoose document (lean)
 * @param {Array} variations - List of product variations
 * @param {Array} stockInfo - List of stock entries
 * @param {Object} specsInfo - Product specifications document
 * @returns {Object} Clean, enriched product object
 */
const formatEnrichedProduct = (product, variations, stockInfo, specsInfo) => {
    // STRICT EXCLUSION: Destructure out all fields that are re-mapped to nested objects
    const {
        // References
        pricingId, categoryId, specsId,
        // Version
        __v,
        // Media (mapped to media)
        images, videoUrls,
        // Identifiers (mapped to identifiers)
        sku, barcode, qrCode, scanId, asin, upc, ean,
        // Codes (mapped to codes)
        barcodePayload, qrPayload, barcodeUrl, qrCodeUrl, barcodeCloudinaryId, qrCloudinaryId,
        // SEO (mapped to seo)
        seo,
        // Sales (mapped to sales)
        sales,
        // Status/Visibility (mapped to status)
        status, visibility, condition, availability, featured, isFeatured, isDeleted, deletedAt, deletedBy,
        // Supply Chain (mapped to pricing or ignored if redundant)
        costPrice,
        // Remaining fields (name, description, slug, brand, manufacturer, tags, supplierName, sortOrder, companyId, shopId, etc.)
        ...productData
    } = product;

    // Calculate total stock across all variations
    const totalStock = stockInfo.reduce((sum, stock) => sum + (stock.stockQty || 0), 0);
    const totalReserved = stockInfo.reduce((sum, stock) => sum + (stock.reservedQty || 0), 0);
    // User req: available field should be equal to the current stockQty (ignoring reservations for this specific view)
    const availableStock = totalStock;
    const lowStockThreshold = stockInfo.length > 0 ? Math.min(...stockInfo.map(s => s.lowStockThreshold || 0)) : 0;
    const hasLowStock = stockInfo.some(s => (s.stockQty || 0) <= (s.lowStockThreshold || 0));

    return {
        ...productData,
        costPrice: Money.toMajor(costPrice),

        // Variations with their own stock info
        variations: variations.map(variation => ({
            ...variation,
            stock: stockInfo.find(s => String(s.variationId) === String(variation._id)) || null,
            attributes: variation.attributeValues || []
        })),

        // Consolidated stock information
        stock: {
            total: totalStock,
            available: availableStock, // Updated to match totalStock as requested
            reserved: totalReserved,
            inStock: availableStock > 0,
            isLowStock: hasLowStock,
            lowStockThreshold,
            trackQuantity: stockInfo.length > 0 ? stockInfo[0].trackQuantity : true,
            allowBackorder: stockInfo.length > 0 ? stockInfo[0].allowBackorder : false,
            details: stockInfo.map(stock => ({
                ...stock,
                availableQty: Math.max(0, (stock.stockQty || 0) - (stock.reservedQty || 0))
            }))
        },

        // Product specifications
        specifications: specsInfo && specsInfo.specs ? specsInfo.specs : {},
        specsCategory: specsInfo ? specsInfo.l2Category : null,

        // Enhanced pricing info (full details)
        pricing: product.pricingId ? {
            id: product.pricingId._id,
            basePrice: Money.toMajor(product.pricingId.basePrice),
            salePrice: Money.toMajor(product.pricingId.salePrice),
            cost: Money.toMajor(product.pricingId.cost),
            currency: product.pricingId.currency,
            marginAmount: Money.toMajor(product.pricingId.marginAmount),
            marginPercent: product.pricingId.marginPercent,
            saleMarginAmount: Money.toMajor(product.pricingId.saleMarginAmount),
            saleMarginPercent: product.pricingId.saleMarginPercent,
            profitRank: product.pricingId.profitRank,
            effectiveFrom: product.pricingId.effectiveFrom,
            effectiveTo: product.pricingId.effectiveTo,
            previousBasePrice: Money.toMajor(product.pricingId.previousBasePrice),
            priceChangedAt: product.pricingId.priceChangedAt,
            revenue: Money.toMajor(product.pricingId.revenue),
            profit: Money.toMajor(product.pricingId.profit)
        } : null,

        // QR and Barcode information (full details)
        codes: {
            qrCodeUrl: product.qrCodeUrl,
            barcodeUrl: product.barcodeUrl,
            qrPayload: product.qrPayload,
            barcodePayload: product.barcodePayload,
            qrCloudinaryId: product.qrCloudinaryId,
            barcodeCloudinaryId: product.barcodeCloudinaryId
        },

        // Auto-generated identifiers
        identifiers: {
            sku: product.sku,
            barcode: product.barcode,
            qrCode: product.qrCode,
            scanId: product.scanId,
            asin: product.asin,
            upc: product.upc,
            ean: product.ean
        },

        // Complete category information
        category: product.categoryId ? {
            id: product.categoryId._id,
            name: product.categoryId.name,
            slug: product.categoryId.slug,
            level: product.categoryId.level,
            parentId: product.categoryId.parentCategory,
            isActive: product.categoryId.isActive,
            attributes: product.categoryId.attributes || []
        } : null,

        // Status and visibility flags
        status: {
            active: product.status === 'active',
            visible: product.visibility === 'public',
            featured: product.featured || product.isFeatured,
            availability: product.availability,
            condition: product.condition,
            isDeleted: product.isDeleted || false,
            deletedAt: product.deletedAt,
            deletedBy: product.deletedBy
        },

        // SEO and marketing data
        seo: {
            keywords: product.seo?.keywords || [],
            metaTitle: product.seo?.metaTitle,
            metaDescription: product.seo?.metaDescription
        },

        // Sales and performance data
        sales: {
            totalSold: product.sales?.totalSold || 0,
            revenue: Money.toMajor(product.sales?.revenue || 0),
            lastSaleDate: product.sales?.lastSaleDate
        },

        // Media information
        media: {
            images: product.images || [],
            videos: product.videoUrls || [],
            primaryImage: product.images?.find(img => img.isPrimary) || (product.images?.[0]) || null
        },

        // Metadata
        metadata: {
            createdAt: product.createdAt,
            updatedAt: product.updatedAt,
            slug: product.slug,
            companyId: product.companyId,
            shopId: product.shopId,
            sortOrder: product.sortOrder
        }
    };
};

module.exports = { formatEnrichedProduct };
