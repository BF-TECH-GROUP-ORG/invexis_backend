/**
 * Sales Event Handler - Inventory Service
 * Handles sales-related events from sales-service
 * Manages stock updates when sales are created, cancelled, or returned
 */

const Product = require('../../models/Product');
const StockChange = require('../../models/StockChange');
const { logger } = require('../../utils/logger');
const { publishProductEvent } = require('../productEvents');
const { processEventOnce } = require('../../utils/eventDeduplication');

/**
 * Handle sale created event - Decrement stock via StockChange
 */
async function handleSaleCreated(data) {
  const { saleId, items, traceId, companyId, shopId, soldBy } = data; // shopId is usually in sale.created

  logger.info(`💰 [sale.created] Processing sale ${saleId}`, { traceId, companyId });

  if (!items || !Array.isArray(items) || items.length === 0) {
    logger.warn(`⚠️ Sale ${saleId} has no items, skipping stock update`);
    return { success: true, message: 'No items to process' };
  }

  const results = [];

  for (const item of items) {
    const { productId, quantity } = item;

    if (!productId || !quantity) {
      logger.warn(`⚠️ Invalid item in sale ${saleId}:`, item);
      continue;
    }

    try {
      const product = await Product.findOne({ _id: productId, companyId });

      if (!product) {
        logger.warn(`⚠️ Product not found: ${productId}`);
        results.push({ productId, status: 'not_found' });
        continue;
      }

      const previousStock = product.inventory.quantity;
      // For sales, quantity must be negative in StockChange logic (checking line 32 of StockChange.js)
      const changeQty = -Math.abs(quantity);
      const newStock = previousStock + changeQty;

      // Create StockChange
      const stockChange = new StockChange({
        companyId,
        shopId: shopId || product.shopId,
        productId,
        changeType: 'sale',
        quantity: changeQty,
        previousStock,
        newStock, // Explicitly set, though pre-save calculates it too
        reason: `Sale ${saleId}`,
        userId: soldBy || 'system',
        changeDate: new Date()
      });

      await stockChange.save(); // This triggers pre-save which updates product stock

      logger.info(`➖ Stock deducted for product ${productId}: ${previousStock} → ${newStock}`, {
        saleId,
        productName: product.name
      });

      // Emit inventory.product.updated event
      await publishProductEvent('inventory.product.updated', await Product.findById(productId));

      // Emit out of stock event if needed
      if (newStock === 0 && previousStock > 0) {
        await publishProductEvent('inventory.out.of.stock', {
          _id: product._id,
          productId: product._id,
          companyId: product.companyId,
          productName: product.name,
          sku: product.sku
        });
      }

      results.push({ productId, status: 'success', oldQuantity: previousStock, newQuantity });
    } catch (error) {
      logger.error(`❌ Error updating stock for product ${productId}:`, error);
      results.push({ productId, status: 'error', error: error.message });
    }
  }

  return results;
}

/**
 * Handle sale canceled event - Restore stock via StockChange
 */
async function handleSaleCanceled(data) {
  const { saleId, items, reason, traceId, companyId } = data; // shopId might be missing

  logger.info(`🚫 [sale.canceled] Processing cancellation for sale ${saleId}`, {
    reason,
    traceId,
    companyId
  });

  if (!items || !Array.isArray(items) || items.length === 0) {
    logger.warn(`⚠️ Sale ${saleId} has no items, skipping stock restoration`);
    return { success: true, message: 'No items to process' };
  }

  const results = [];

  for (const item of items) {
    const { productId, quantity } = item;

    if (!productId || !quantity) {
      continue;
    }

    try {
      const product = await Product.findOne({ _id: productId, companyId });
      if (!product) {
        results.push({ productId, status: 'not_found' });
        continue;
      }

      const previousStock = product.inventory.quantity;
      const changeQty = Math.abs(quantity); // Positive for restoration
      const newStock = previousStock + changeQty;

      // Create StockChange (changeType: 'restock' or 'adjustment' - using 'restock' implies positive)
      const stockChange = new StockChange({
        companyId,
        shopId: product.shopId, // Fallback to product's shopId
        productId,
        changeType: 'restock',
        quantity: changeQty,
        previousStock,
        newStock,
        reason: `Sale ${saleId} canceled: ${reason}`,
        userId: 'system',
        changeDate: new Date()
      });

      await stockChange.save();

      logger.info(`➕ Stock restored for product ${productId}: ${previousStock} → ${newStock}`, {
        saleId
      });

      await publishProductEvent('inventory.product.updated', await Product.findById(productId));

      results.push({ productId, status: 'success', oldQuantity: previousStock, newQuantity });
    } catch (error) {
      logger.error(`❌ Error restoring stock for product ${productId}:`, error);
      results.push({ productId, status: 'error', error: error.message });
    }
  }

  return results;
}

/**
 * Handle sale return fully returned event - Restore stock via StockChange
 */
async function handleSaleReturnFullyReturned(data) {
  const { returnId, saleId, items, traceId, companyId } = data;

  logger.info(`↩️ [sale.return.fully_returned] Processing return ${returnId} for sale ${saleId}`, {
    traceId,
    companyId
  });

  if (!items || !Array.isArray(items) || items.length === 0) {
    return { success: true, message: 'No items to process' };
  }

  const results = [];

  for (const item of items) {
    const { productId, quantity } = item;

    if (!productId || !quantity) continue;

    try {
      const product = await Product.findOne({ _id: productId, companyId });
      if (!product) {
        results.push({ productId, status: 'not_found' });
        continue;
      }

      const previousStock = product.inventory.quantity;
      const changeQty = Math.abs(quantity);
      const newStock = previousStock + changeQty;

      const stockChange = new StockChange({
        companyId,
        shopId: product.shopId,
        productId,
        changeType: 'return',
        quantity: changeQty,
        previousStock,
        newStock,
        reason: `Return ${returnId} for sale ${saleId}`,
        userId: 'system',
        changeDate: new Date()
      });

      await stockChange.save();

      logger.info(`➕ Stock restored for returned product ${productId}: ${previousStock} → ${newStock}`, {
        returnId,
        saleId
      });

      await publishProductEvent('inventory.product.updated', await Product.findById(productId));

      results.push({ productId, status: 'success', oldQuantity: previousStock, newQuantity });
    } catch (error) {
      logger.error(`❌ Error restoring stock for returned product ${productId}:`, error);
      results.push({ productId, status: 'error', error: error.message });
    }
  }

  return results;
}

/**
 * Main handler function for sales events
 * Includes automatic deduplication logic
 */
module.exports = async function handleSalesEvent(event) {
  try {
    const { type, payload, data } = event;
    const eventData = payload || data;

    if (!type) {
      logger.error('❌ Event type is missing');
      return;
    }

    if (!eventData) {
      logger.error('❌ Event data/payload is missing');
      return;
    }

    // Generate event ID for deduplication
    const traceId = eventData.traceId || eventData.trace_id;
    const fallbackId = eventData.saleId || eventData.orderId || eventData.returnId || eventData.id || '';
    const eventId = traceId || `${type}:${fallbackId}:${Date.now()}`;

    logger.info(`💰 Processing sales event: ${type}`, { eventId });

    // Process event with automatic deduplication
    const result = await processEventOnce(
      eventId,
      type,
      async () => {
        switch (type) {
          case 'sale.created':
            return await handleSaleCreated(eventData);

          case 'sale.canceled':
          case 'sale.cancelled':
            return await handleSaleCanceled(eventData);

          case 'sale.return.fully_returned':
          case 'sale.return.confirmed':
            return await handleSaleReturnFullyReturned(eventData);

          default:
            logger.warn(`⚠️ Unhandled sales event type: ${type}`);
            return null;
        }
      },
      { eventType: type, timestamp: new Date(), saleId: eventData.saleId }
    );

    if (result.duplicate) {
      logger.info(`🔄 Skipped duplicate sales event: ${type}`, { eventId });
      return;
    }

    logger.info(`✅ Successfully processed sales event: ${type}`, { eventId });
  } catch (error) {
    logger.error(`❌ Error handling sales event: ${error.message}`, error);
    throw error;
  }
};
