/**
 * Inventory Event Handler
 * Handles inventory-related events from inventory-service
 * Manages product catalog sync and cache invalidation
 */

const CatalogProduct = require('../../models/Catalog.models');
const cache = require('../../utils/cache');
const logger = require('../../utils/logger');
const { processEventOnce } = require('../../utils/eventDeduplication');

/**
 * Handle product created event - Create CatalogProduct & Cache
 */
async function handleProductCreated(data) {
  try {
    const { productId, companyId } = data;

    logger.info(`📦 [inventory.product.created] Processing: ${productId}`);

    // Idempotency check: if already exists, update it instead
    let product = await CatalogProduct.findOne({ productId, companyId });

    if (product) {
      logger.info(`⚠️ Product ${productId} already exists, updating instead.`);
      product.updateFromInventory(data);
    } else {
      // Create new catalog product
      product = new CatalogProduct({
        productId,
        companyId,
        shopId: data.shopId
      });
      product.updateFromInventory(data);
    }

    await product.save();
    logger.info(`✅ CatalogProduct created/synced: ${productId}`);

    // Invalidate product list cache
    await cache.del(`products:${companyId}:*`);
  } catch (error) {
    logger.error(`❌ Error handling product created: ${error.message}`);
    throw error;
  }
}

/**
 * Handle product updated event - Update CatalogProduct & Cache
 */
async function handleProductUpdated(data) {
  try {
    const { productId, companyId } = data;

    logger.info(`📦 [inventory.product.updated] Processing: ${productId}`);

    const product = await CatalogProduct.findOne({ productId, companyId });

    if (!product) {
      logger.warn(`⚠️ Product ${productId} not found for update. Creating it now (Self-healing).`);
      return handleProductCreated(data);
    }

    product.updateFromInventory(data);
    await product.save();

    logger.info(`✅ CatalogProduct updated: ${productId}`);

    // Invalidate product cache
    await cache.del(`product:${companyId}:${productId}`);
    await cache.del(`products:${companyId}:*`);

    // Invalidate related caches
    await cache.del(`cart:${companyId}:*`);
    await cache.del(`wishlist:${companyId}:*`);
  } catch (error) {
    logger.error(`❌ Error handling product updated: ${error.message}`);
    throw error;
  }
}

/**
 * Handle product deleted event - Soft delete CatalogProduct & Cache
 */
async function handleProductDeleted(data) {
  try {
    const { productId, companyId } = data;

    logger.info(`📦 [inventory.product.deleted] Processing: ${productId}`);

    // Soft delete to preserve order history/integrity
    await CatalogProduct.findOneAndUpdate(
      { productId, companyId },
      {
        isDeleted: true,
        isActive: false,
        status: 'discontinued',
        lastSyncedAt: new Date()
      }
    );

    logger.info(`✅ CatalogProduct marked as deleted: ${productId}`);

    // Invalidate product cache
    await cache.del(`product:${companyId}:${productId}`);
    await cache.del(`products:${companyId}:*`);

    // Invalidate related caches
    await cache.del(`cart:${companyId}:*`);
    await cache.del(`wishlist:${companyId}:*`);
  } catch (error) {
    logger.error(`❌ Error handling product deleted: ${error.message}`);
    throw error;
  }
}

/**
 * Handle stock updated event - Update CatalogProduct Stock & Cache
 */
async function handleStockUpdated(data) {
  try {
    const { productId, companyId, newQuantity } = data;

    logger.info(`📦 [inventory.stock.updated] Processing: ${productId} → ${newQuantity}`);

    const product = await CatalogProduct.findOne({ productId, companyId });

    if (!product) {
      logger.warn(`⚠️ Product ${productId} not found for stock update.`);
      return;
    }

    product.stockQty = newQuantity;

    // Update availability logic if needed (though updateFromInventory handles it usually, simple stock updates might miss it)
    if (newQuantity <= 0 && product.availability !== 'scheduled') {
      product.availability = 'out_of_stock';
    } else if (newQuantity > 0 && product.availability === 'out_of_stock') {
      product.availability = 'in_stock';
    }

    product.lastSyncedAt = new Date();
    await product.save();

    logger.info(`✅ CatalogProduct stock updated: ${productId}`);

    // Invalidate product cache
    await cache.del(`product:${companyId}:${productId}`);
    await cache.del(`products:${companyId}:*`);
  } catch (error) {
    logger.error(`❌ Error handling stock updated: ${error.message}`);
    throw error;
  }
}

/**
 * Handle out of stock event - Mark product unavailable
 */
async function handleOutOfStock(data) {
  try {
    const { productId, companyId, productName } = data;

    logger.info(`📦 [inventory.out.of.stock] Processing: ${productName}`);

    await CatalogProduct.findOneAndUpdate(
      { productId, companyId },
      {
        stockQty: 0,
        availability: 'out_of_stock',
        lastSyncedAt: new Date()
      }
    );

    // Invalidate product cache
    await cache.del(`product:${companyId}:${productId}`);
    await cache.del(`products:${companyId}:*`);
    await cache.del(`cart:${companyId}:*`);

    logger.info(`✅ Out of stock processed`);
  } catch (error) {
    logger.error(`❌ Error handling out of stock: ${error.message}`);
    throw error;
  }
}

/**
 * Main handler function
 */
module.exports = async function handleInventoryEvent(event) {
  try {
    const { type, data } = event;

    logger.info(`📦 Processing inventory event: ${type}`);

    // Generate event ID for deduplication
    const traceId = data.traceId || data.trace_id;
    const fallbackId = data.productId || data.id || '';
    const eventId = traceId || `${type}:${fallbackId}:${Date.now()}`;

    // Process event with automatic deduplication
    const result = await processEventOnce(
      eventId,
      type,
      async () => {
        switch (type) {
          case 'inventory.product.created':
            await handleProductCreated(data);
            break;

          case 'inventory.product.updated':
            await handleProductUpdated(data);
            break;

          case 'inventory.product.deleted':
            await handleProductDeleted(data);
            break;

          case 'inventory.stock.updated':
            await handleStockUpdated(data);
            break;

          case 'inventory.out.of.stock':
            await handleOutOfStock(data);
            break;

          default:
            logger.warn(`⚠️ Unhandled inventory event type: ${type}`);
        }
      },
      { eventType: type, timestamp: new Date(), productId: data.productId }
    );

    if (result.duplicate) {
      logger.info(`🔄 Skipped duplicate inventory event: ${type}`, { eventId });
    }

  } catch (error) {
    logger.error(`❌ Error handling inventory event: ${error.message}`);
    throw error;
  }
};

