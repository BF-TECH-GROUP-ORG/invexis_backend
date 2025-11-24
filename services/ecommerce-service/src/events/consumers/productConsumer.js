const Catalog = require('../../models/Catalog.models');
const cache = require('../../utils/cache');

// Handles product CRUD events from inventory service
async function handleProductEvent(event, routingKey) {
    // Map inventory product fields to catalog schema
    const data = event.data;
    const catalogDoc = {
        productId: data._id,
        companyId: data.companyId,
        name: data.name,
        slug: data.slug,
        shortDescription: data.shortDescription,
        price: data.pricing?.basePrice || data.price,
        currency: data.currency || 'USD',
        salePrice: data.pricing?.salePrice,
        featured: !!data.featured,
        images: Array.isArray(data.images) ? data.images.map(img => ({
            url: img.url,
            alt: img.alt,
            isPrimary: img.isPrimary,
            sortOrder: img.sortOrder
        })) : [],
        status: data.status || 'active',
        visibility: data.visibility || 'public',
        categoryId: data.categoryId,
        subcategoryId: data.subcategoryId,
        subSubcategoryId: data.subSubcategoryId,
        stockQty: data.inventory?.quantity || 0,
        availability: data.inventory?.availability || 'in_stock',
        relatedPromotionIds: data.relatedPromotionIds || [],
        relatedBannerIds: data.relatedBannerIds || [],
        metadata: data.metadata,
        createdBy: data.createdBy,
        updatedBy: data.updatedBy
    };

    switch (routingKey) {
        case 'inventory.product.created':
            await Catalog.create(catalogDoc);
            break;
        case 'inventory.product.updated':
            // Find by productId, not _id, to ensure correct mapping
            await Catalog.updateOne({ productId: data._id }, catalogDoc, { upsert: true });
            break;
        case 'inventory.product.deleted':
            await Catalog.deleteOne({ productId: data._id });
            break;
    }
    // Invalidate or refresh Redis cache for catalog
    await cache.del(`catalog:${data._id}`);
}

module.exports = handleProductEvent;
