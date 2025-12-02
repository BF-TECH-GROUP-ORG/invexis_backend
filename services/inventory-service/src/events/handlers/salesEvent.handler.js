/**
 * Sales Event Handler - Inventory Service
 * Handles sales-related events from sales-service
 * Manages stock updates when sales are created, cancelled, or returned
 */

const Product = require('../../models/Product');
const { logger } = require('../../utils/logger');
const { publishProductEvent } = require('../productEvents');
const { processEventOnce } = require('../../utils/eventDeduplication');

/**
 * Handle sale created event - Decrement stock for sold items
 */
async function handleSaleCreated(data) {
  const { saleId, items, traceId, companyId } = data;

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
      const product = await Product.findById(productId);

      if (!product) {
        logger.warn(`⚠️ Product not found: ${productId}`);
        results.push({ productId, status: 'not_found' });
        continue;
      }

      const oldQuantity = product.inventory.quantity;
      const newQuantity = Math.max(0, oldQuantity - quantity);

      product.inventory.quantity = newQuantity;

      // Update availability if out of stock
      if (newQuantity === 0 && oldQuantity > 0) {
        product.availability = 'out_of_stock';
      }

      // Add audit trail
      product.auditTrail.push({
        action: 'stock_change',
        changedBy: 'sales-service',
        oldValue: { quantity: oldQuantity },
        newValue: { quantity: newQuantity, reason: `Sale ${saleId}` }
      });

      await product.save();

      logger.info(`➖ Decremented stock for product ${productId}: ${oldQuantity} → ${newQuantity}`, {
        saleId,
        productName: product.name
      });

      // Emit inventory.product.updated event
      await publishProductEvent('inventory.product.updated', product.toObject());

      // Emit out of stock event if needed
      if (newQuantity === 0 && oldQuantity > 0) {
        await publishProductEvent('inventory.out.of.stock', {
          _id: product._id,
          productId: product._id,
          companyId: product.companyId,
          productName: product.name,
          sku: product.sku
        });
      }

      results.push({ productId, status: 'success', oldQuantity, newQuantity });
    } catch (error) {
      logger.error(`❌ Error updating stock for product ${productId}:`, error);
      results.push({ productId, status: 'error', error: error.message });
    }
  }

  logger.info(`✅ Sale ${saleId} stock update complete`, {
    totalItems: items.length,
    successful: results.filter(r => r.status === 'success').length,
    failed: results.filter(r => r.status === 'error').length
  });

  return results;
}

/**
 * Handle sale canceled event - Restore stock for cancelled items
 */
async function handleSaleCanceled(data) {
  const { saleId, items, reason, traceId, companyId } = data;

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
      logger.warn(`⚠️ Invalid item in sale ${saleId}:`, item);
      continue;
    }

    try {
      const product = await Product.findById(productId);

      if (!product) {
        logger.warn(`⚠️ Product not found: ${productId}`);
        results.push({ productId, status: 'not_found' });
        continue;
      }

      const oldQuantity = product.inventory.quantity;
      const newQuantity = oldQuantity + quantity;

      product.inventory.quantity = newQuantity;

      // Update availability if back in stock
      if (oldQuantity === 0 && newQuantity > 0) {
        product.availability = 'in_stock';
      }

      // Add audit trail
      product.auditTrail.push({
        action: 'stock_change',
        changedBy: 'sales-service',
        oldValue: { quantity: oldQuantity },
        newValue: { quantity: newQuantity, reason: `Sale ${saleId} canceled: ${reason}` }
      });

      await product.save();

      logger.info(`➕ Restored stock for product ${productId}: ${oldQuantity} → ${newQuantity}`, {
        saleId,
        productName: product.name
      });

      // Emit inventory.product.updated event
      await publishProductEvent('inventory.product.updated', product.toObject());

      results.push({ productId, status: 'success', oldQuantity, newQuantity });
    } catch (error) {
      logger.error(`❌ Error restoring stock for product ${productId}:`, error);
      results.push({ productId, status: 'error', error: error.message });
    }
  }

  logger.info(`✅ Sale ${saleId} cancellation stock restoration complete`, {
    totalItems: items.length,
    successful: results.filter(r => r.status === 'success').length,
    failed: results.filter(r => r.status === 'error').length
  });

  return results;
}

/**
 * Handle sale return fully returned event - Restore stock for returned items
 */
async function handleSaleReturnFullyReturned(data) {
  const { returnId, saleId, items, traceId, companyId } = data;

  logger.info(`↩️ [sale.return.fully_returned] Processing return ${returnId} for sale ${saleId}`, {
    traceId,
    companyId
  });

  if (!items || !Array.isArray(items) || items.length === 0) {
    logger.warn(`⚠️ Return ${returnId} has no items, skipping stock restoration`);
    return { success: true, message: 'No items to process' };
  }

  const results = [];

  for (const item of items) {
    const { productId, quantity } = item;

    if (!productId || !quantity) {
      logger.warn(`⚠️ Invalid item in return ${returnId}:`, item);
      continue;
    }

    try {
      const product = await Product.findById(productId);

      if (!product) {
        logger.warn(`⚠️ Product not found: ${productId}`);
        results.push({ productId, status: 'not_found' });
        continue;
      }

      const oldQuantity = product.inventory.quantity;
      const newQuantity = oldQuantity + quantity;

      product.inventory.quantity = newQuantity;

      // Update availability if back in stock
      if (oldQuantity === 0 && newQuantity > 0) {
        product.availability = 'in_stock';
      }

      // Add audit trail
      product.auditTrail.push({
        action: 'stock_change',
        changedBy: 'sales-service',
        oldValue: { quantity: oldQuantity },
        newValue: { quantity: newQuantity, reason: `Return ${returnId} for sale ${saleId}` }
      });

      await product.save();

      logger.info(`➕ Restored stock for returned product ${productId}: ${oldQuantity} → ${newQuantity}`, {
        returnId,
        saleId,
        productName: product.name
      });

      // Emit inventory.product.updated event
      await publishProductEvent('inventory.product.updated', product.toObject());

      results.push({ productId, status: 'success', oldQuantity, newQuantity });
    } catch (error) {
      logger.error(`❌ Error restoring stock for returned product ${productId}:`, error);
      results.push({ productId, status: 'error', error: error.message });
    }
  }

  logger.info(`✅ Return ${returnId} stock restoration complete`, {
    totalItems: items.length,
    successful: results.filter(r => r.status === 'success').length,
    failed: results.filter(r => r.status === 'error').length
  });

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
