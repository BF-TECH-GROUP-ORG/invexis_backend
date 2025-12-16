/**
 * Product Consumer - E-Commerce Service
 * Handles inventory service product events (create, update, delete)
 * Syncs all critical product information to the Catalog model
 */
const Catalog = require('../../models/Catalog.models');
const cache = require('../../utils/cache');
const logger = require('../../utils/logger');

// Handles product CRUD events from inventory service
async function handleProductEvent(event, routingKey) {
    try {
        const data = event.data || event;

        if (!data || !data._id) {
            logger.error('Invalid product event data', { event, routingKey });
            throw new Error('Missing required product ID in event data');
        }

        logger.info(`📦 Processing ${routingKey}`, {
            productId: data._id,
            productName: data.name,
            companyId: data.companyId
        });

        switch (routingKey) {
            case 'inventory.product.created':
                await handleProductCreated(data);
                break;

            case 'inventory.product.updated':
                await handleProductUpdated(data);
                break;

            case 'inventory.product.deleted':
                await handleProductDeleted(data);
                break;

            default:
                logger.warn(`Unhandled routing key: ${routingKey}`);
        }

        // Invalidate cache
        await cache.del(`catalog:${data._id}`);
        await cache.del(`products:${data.companyId}:*`);

        logger.info(`✅ Successfully processed ${routingKey}`, {
            productId: data._id,
            productName: data.name
        });
    } catch (error) {
        logger.error(`❌ Error in handleProductEvent (${routingKey}):`, error);
        throw error; // Let registerConsumer handle retry logic
    }
}

/**
 * Handle product created event
 * Creates new catalog entry with all inventory data
 */
async function handleProductCreated(inventoryProduct) {
    try {
        // Check if already exists
        let catalogProduct = await Catalog.findOne({ productId: inventoryProduct._id });

        if (catalogProduct) {
            // If exists, update it
            logger.warn(`Product already exists in catalog, updating instead`, {
                productId: inventoryProduct._id
            });
            catalogProduct.updateFromInventory(inventoryProduct);
            await catalogProduct.save();
            return catalogProduct;
        }

        // Create new catalog entry
        const newCatalogProduct = new Catalog({
            productId: inventoryProduct._id,
            companyId: inventoryProduct.companyId,
            shopId: inventoryProduct.shopId
        });

        // Update with all inventory data
        newCatalogProduct.updateFromInventory(inventoryProduct);
        await newCatalogProduct.save();

        logger.info(`✅ Catalog product created`, {
            catalogId: newCatalogProduct._id,
            productId: inventoryProduct._id
        });

        return newCatalogProduct;
    } catch (error) {
        logger.error('Error in handleProductCreated:', error);
        throw error;
    }
}

/**
 * Handle product updated event
 * Updates existing catalog entry, preserves ecommerce-specific fields
 */
async function handleProductUpdated(inventoryProduct) {
    try {
        let catalogProduct = await Catalog.findOne({ productId: inventoryProduct._id });

        if (!catalogProduct) {
            logger.warn(`Product not found in catalog, creating instead`, {
                productId: inventoryProduct._id
            });
            // Create if doesn't exist (upsert behavior)
            return handleProductCreated(inventoryProduct);
        }

        // Update with inventory data (preserves promotions, reviews, etc.)
        catalogProduct.updateFromInventory(inventoryProduct);
        await catalogProduct.save();

        logger.info(`✅ Catalog product updated`, {
            catalogId: catalogProduct._id,
            productId: inventoryProduct._id
        });

        return catalogProduct;
    } catch (error) {
        logger.error('Error in handleProductUpdated:', error);
        throw error;
    }
}

/**
 * Handle product deleted event
 * Soft delete - marks as inactive/archived, preserves data
 */
async function handleProductDeleted(inventoryProduct) {
    try {
        const catalogProduct = await Catalog.findOne({ productId: inventoryProduct._id });

        if (!catalogProduct) {
            logger.warn(`Product not found in catalog for deletion`, {
                productId: inventoryProduct._id
            });
            return null;
        }

        // Soft delete - mark as archived
        catalogProduct.status = 'discontinued';
        catalogProduct.isActive = false;
        catalogProduct.lastUpdatedFrom = 'inventory';
        catalogProduct.lastSyncedAt = new Date();
        await catalogProduct.save();

        logger.info(`✅ Catalog product marked as deleted`, {
            catalogId: catalogProduct._id,
            productId: inventoryProduct._id
        });

        return catalogProduct;
    } catch (error) {
        logger.error('Error in handleProductDeleted:', error);
        throw error;
    }
}

module.exports = handleProductEvent;
