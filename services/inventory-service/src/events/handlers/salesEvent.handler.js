/**
 * Sales Event Handler - Inventory Service
 * Handles sales-related events from sales-service
 * Manages stock updates when sales are created, cancelled, or returned
 */

const mongoose = require('mongoose');
const Product = require('../../models/Product');
const ProductStock = require('../../models/ProductStock');
const StockChange = require('../../models/StockChange');
const logger = require('../../utils/logger');
const redisHelper = require('../../utils/redisHelper');
const { publishProductEvent } = require('../productEvents');
const { processEventOnce } = require('../../utils/eventDeduplication');

/**
 * Handle sale created event - Decrement stock via StockChange
 */
async function handleSaleCreated(data) {
  const { saleId, items, traceId, companyId, shopId, soldBy } = data;

  logger.info(`💰 [INVENTORY DEBUG] [sale.created] Processing sale ${saleId} with ${items.length} items`, {
    traceId,
    companyId,
    shopId,
    items,
    timestamp: new Date().toISOString()
  });

  if (!items || !Array.isArray(items) || items.length === 0) {
    logger.warn(`⚠️ Sale ${saleId} has no items, skipping stock update`);
    return { success: true, message: 'No items to process' };
  }

  if (!companyId || !shopId) {
    logger.error(`❌ Missing companyId or shopId in sale ${saleId}`, { companyId, shopId });
    return { success: false, message: 'Missing required fields: companyId, shopId' };
  }

  const results = [];

  for (const item of items) {
    const { productId, quantity, unitPrice } = item;

    // Ensure quantity is a number
    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      logger.warn(`⚠️ Invalid quantity in sale ${saleId} for product ${productId}:`, { quantity, qty });
      continue;
    }

    if (!productId) {
      logger.warn(`⚠️ Invalid item in sale ${saleId} (missing productId):`, item);
      continue;
    }

    try {
      // Convert productId to ObjectId if it's a string
      let productIdObj = productId;
      if (typeof productId === 'string' && mongoose.Types.ObjectId.isValid(productId)) {
        productIdObj = new mongoose.Types.ObjectId(productId);
      } else if (typeof productId !== 'string' && !(productId instanceof mongoose.Types.ObjectId)) {
        logger.warn(`⚠️ Invalid productId format in sale ${saleId}:`, { productId, type: typeof productId });
        results.push({ productId, status: 'invalid_product_id_format' });
        continue;
      }

      // Verify product exists and belongs to company
      const product = await Product.findOne({ _id: productIdObj, companyId });

      if (!product) {
        logger.warn(`⚠️ Product not found: ${productId} (${productIdObj}) for company ${companyId}`);
        results.push({ productId, status: 'not_found' });
        continue;
      }

      // Get current stock from ProductStock model
      const stockRecord = await ProductStock.findOne({
        productId: productIdObj,
        variationId: null // Master product stock (no variation)
      });

      if (!stockRecord) {
        logger.warn(`⚠️ ProductStock record not found for product ${productId}`);
        results.push({ productId, status: 'stock_record_not_found' });
        continue;
      }

      // Check if tracking is enabled
      if (!stockRecord.trackQuantity) {
        logger.info(`ℹ️ Quantity tracking disabled for product ${productId}, skipping stock update`);
        results.push({ productId, status: 'tracking_disabled' });
        continue;
      }

      const previousStock = stockRecord.stockQty || 0;
      // Use the validated qty from above (already a number)
      const saleQty = Math.abs(qty);

      logger.info(`📦 Processing stock deduction for product ${productId}`, {
        saleId,
        productId,
        saleQty,
        previousStock,
        allowBackorder: stockRecord.allowBackorder,
        trackQuantity: stockRecord.trackQuantity
      });

      // Check if enough stock available (unless backorder is allowed)
      if (!stockRecord.allowBackorder && previousStock < saleQty) {
        logger.warn(`⚠️ Insufficient stock for product ${productId}: ${previousStock} available, ${saleQty} requested`, {
          saleId,
          productId,
          previousStock,
          saleQty
        });
        results.push({ productId, status: 'insufficient_stock', available: previousStock, requested: saleQty });
        continue;
      }

      // For sales, quantity must be negative (outflow)
      const changeQty = -saleQty;

      logger.info(`📝 Creating StockChange for sale ${saleId}`, {
        productId,
        changeQty,
        previousStock,
        expectedNewStock: previousStock + changeQty
      });

      // Create StockChange - the pre-save hook will atomically update ProductStock
      const stockChange = new StockChange({
        companyId,
        shopId: shopId || product.shopId,
        productId: productId, // Already ObjectId or handled
        variationId: null, // Master product, no variation
        type: 'sale', // Use 'type' not 'changeType'
        qty: changeQty, // Use 'qty' not 'quantity', negative for outflow
        previous: previousStock, // Use 'previous' not 'previousStock'
        reason: `Sale ${saleId}`,
        userId: soldBy || 'system',
        meta: {
          saleId: saleId,
          unitPrice: unitPrice || 0,
          unitCost: item.costPrice || 0, // ADDED: Capture cost for profit analytics
          customerName: data.customerName || null,
          productName: product.name, // ADDED: Snapshot name
          receiptNo: saleId.toString(),
          isDebt: !!data.isDebt // Analytics: Debt tracking
        }
        // 'new' will be calculated by pre-save hook
      });

      await stockChange.save(); // Pre-save hook updates ProductStock atomically

      // Get updated stock after save to verify
      const updatedStock = await ProductStock.findOne({
        productId: productIdObj,
        variationId: null
      }).lean();

      const newStock = updatedStock ? updatedStock.stockQty : previousStock + changeQty;

      // Verify the stock was actually updated
      if (updatedStock && updatedStock.stockQty !== newStock) {
        logger.warn(`⚠️ Stock mismatch after save for product ${productId}`, {
          expected: newStock,
          actual: updatedStock.stockQty,
          previousStock,
          changeQty
        });
      }

      logger.info(`✅ Stock deducted for product ${productId}: ${previousStock} → ${newStock} (sale ${saleId})`, {
        saleId,
        productId,
        productName: product.name,
        quantitySold: saleQty,
        changeQty,
        previousStock,
        newStock,
        soldBy: soldBy || 'system',
        stockRecordId: updatedStock?._id
      });

      // Emit inventory events
      await publishProductEvent('inventory.product.updated', {
        _id: product._id,
        companyId: product.companyId,
        productId: product._id,
        name: product.name,
        productName: product.name,
        categoryId: product.categoryId,
        sku: product.sku
      });
      await publishProductEvent('inventory.stock.updated', {
        productId: product._id,
        companyId: product.companyId,
        shopId: shopId || product.shopId,
        oldQuantity: previousStock,
        newQuantity: newStock,
        quantityChange: changeQty, // -ve for sale
        type: 'SALE',
        unitCost: item.costPrice || 0,
        productName: product.name,
        categoryId: product.categoryId,
        traceId: traceId || data.traceId
      });

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

      // Emit low stock alert if threshold crossed
      if (newStock <= stockRecord.lowStockThreshold && previousStock > stockRecord.lowStockThreshold) {
        await publishProductEvent('inventory.low.stock', {
          productId: product._id,
          companyId: product.companyId,
          productName: product.name,
          currentQuantity: newStock,
          threshold: stockRecord.lowStockThreshold
        });
      }

      results.push({ productId, status: 'success', oldQuantity: previousStock, newQuantity: newStock });

      // Invalidate Product Analytics Cache
      await redisHelper.delCache(`analytics:product:${productId}`);

    } catch (error) {
      logger.error(`❌ Error updating stock for product ${productId}:`, error);
      results.push({ productId, status: 'error', error: error.message });
    }
  }

  // Broader Analytics Cache Invalidation (If any item succeeded)
  if (results.some(r => r.status === 'success')) {
    await redisHelper.scanDel(`inventory:analytics:overview:${companyId}:*`);
    await redisHelper.scanDel(`analytics:company:${companyId}:*`);
    if (shopId) await redisHelper.scanDel(`analytics:shop:${shopId}:*`);
    await redisHelper.scanDel(`analytics:graph:*:${companyId}:*`);
  }

  return results;
}

/**
 * Handle sale canceled event - Restore stock via StockChange
 */
async function handleSaleCanceled(data) {
  const { saleId, items, reason, traceId, companyId, shopId } = data;

  logger.info(`🚫 [sale.canceled] Processing cancellation for sale ${saleId}`, {
    reason,
    traceId,
    companyId
  });

  if (!items || !Array.isArray(items) || items.length === 0) {
    logger.warn(`⚠️ Sale ${saleId} has no items, skipping stock restoration`);
    return { success: true, message: 'No items to process' };
  }

  if (!companyId) {
    logger.error(`❌ Missing companyId in sale cancellation ${saleId}`);
    return { success: false, message: 'Missing required field: companyId' };
  }

  const results = [];

  for (const item of items) {
    const { productId, quantity } = item;

    if (!productId || !quantity) {
      logger.warn(`⚠️ Invalid item in cancelled sale ${saleId}:`, item);
      continue;
    }

    try {
      // Verify product exists and belongs to company
      const product = await Product.findOne({ _id: productId, companyId });
      if (!product) {
        logger.warn(`⚠️ Product not found: ${productId} for company ${companyId}`);
        results.push({ productId, status: 'not_found' });
        continue;
      }

      // Get current stock from ProductStock model
      const stockRecord = await ProductStock.findOne({
        productId: productId,
        variationId: null // Master product stock
      });

      if (!stockRecord) {
        logger.warn(`⚠️ ProductStock record not found for product ${productId}`);
        results.push({ productId, status: 'stock_record_not_found' });
        continue;
      }

      // Check if tracking is enabled
      if (!stockRecord.trackQuantity) {
        logger.info(`ℹ️ Quantity tracking disabled for product ${productId}, skipping stock restoration`);
        results.push({ productId, status: 'tracking_disabled' });
        continue;
      }

      const previousStock = stockRecord.stockQty || 0;
      const restoreQty = Math.abs(parseInt(quantity, 10));

      // For returns/restock, quantity must be positive (inflow)
      const changeQty = restoreQty;

      // Create StockChange - type 'return' for restoring stock from cancelled sale
      const stockChange = new StockChange({
        companyId,
        shopId: shopId || product.shopId,
        productId: productId, // Already ObjectId or handled
        variationId: null, // Master product, no variation
        type: 'return', // Use 'return' type for restoring stock from cancelled sales
        qty: changeQty, // Positive for inflow
        previous: previousStock,
        reason: `Sale ${saleId} canceled${reason ? `: ${reason}` : ''}`,
        userId: 'system',
        meta: {
          saleId: saleId,
          cancellationReason: reason || null,
          productName: product.name,
          categoryId: product.categoryId,
          unitCost: product.pricingId?.cost || 0
        }
        // 'new' will be calculated by pre-save hook
      });

      await stockChange.save(); // Pre-save hook updates ProductStock atomically

      // Get updated stock after save
      const updatedStock = await ProductStock.findOne({
        productId: productId,
        variationId: null
      });

      const newStock = updatedStock ? updatedStock.stockQty : previousStock + changeQty;

      logger.info(`➕ Stock restored for product ${productId}: ${previousStock} → ${newStock} (cancelled sale ${saleId})`, {
        saleId,
        productName: product.name,
        quantity: restoreQty,
        reason
      });

      // Emit inventory events
      await publishProductEvent('inventory.product.updated', {
        _id: product._id,
        companyId: product.companyId,
        productId: product._id,
        name: product.name,
        productName: product.name,
        categoryId: product.categoryId,
        sku: product.sku
      });
      await publishProductEvent('inventory.stock.updated', {
        productId: product._id,
        companyId: product.companyId,
        shopId: shopId || product.shopId,
        oldQuantity: previousStock,
        newQuantity: newStock,
        quantityChange: changeQty, // +ve for restore
        type: 'RETURN',
        unitCost: item.costPrice || 0,
        productName: product.name,
        categoryId: product.categoryId,
        traceId: traceId || data.traceId
      });

      // Emit restocked event if stock was restored from zero
      if (previousStock === 0 && newStock > 0) {
        await publishProductEvent('inventory.restocked', {
          productId: product._id,
          companyId: product.companyId,
          productName: product.name,
          quantity: restoreQty
        });
      }

      results.push({ productId, status: 'success', oldQuantity: previousStock, newQuantity: newStock });
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
  const { returnId, saleId, items, traceId, companyId, shopId } = data;

  logger.info(`↩️ [sale.return.fully_returned] Processing return ${returnId} for sale ${saleId}`, {
    traceId,
    companyId
  });

  if (!items || !Array.isArray(items) || items.length === 0) {
    logger.warn(`⚠️ Return ${returnId} has no items, skipping stock restoration`);
    return { success: true, message: 'No items to process' };
  }

  if (!companyId) {
    logger.error(`❌ Missing companyId in return ${returnId}`);
    return { success: false, message: 'Missing required field: companyId' };
  }

  const results = [];

  for (const item of items) {
    const { productId, quantity } = item;

    if (!productId || !quantity) {
      logger.warn(`⚠️ Invalid item in return ${returnId}:`, item);
      continue;
    }

    try {
      // Convert productId to ObjectId if it's a string
      let productIdObj = productId;
      if (typeof productId === 'string' && mongoose.Types.ObjectId.isValid(productId)) {
        productIdObj = new mongoose.Types.ObjectId(productId);
      } else if (typeof productId !== 'string' && !(productId instanceof mongoose.Types.ObjectId)) {
        logger.warn(`⚠️ Invalid productId format in return ${returnId}:`, { productId, type: typeof productId });
        results.push({ productId, status: 'invalid_product_id_format' });
        continue;
      }

      // Verify product exists and belongs to company
      const product = await Product.findOne({ _id: productIdObj, companyId });
      if (!product) {
        logger.warn(`⚠️ Product not found: ${productId} (${productIdObj}) for company ${companyId}`);
        results.push({ productId, status: 'not_found' });
        continue;
      }

      // Get current stock from ProductStock model
      const stockRecord = await ProductStock.findOne({
        productId: productIdObj,
        variationId: null // Master product stock
      });

      if (!stockRecord) {
        logger.warn(`⚠️ ProductStock record not found for product ${productId}`);
        results.push({ productId, status: 'stock_record_not_found' });
        continue;
      }

      // Check if tracking is enabled
      if (!stockRecord.trackQuantity) {
        logger.info(`ℹ️ Quantity tracking disabled for product ${productId}, skipping stock restoration`);
        results.push({ productId, status: 'tracking_disabled' });
        continue;
      }

      const previousStock = stockRecord.stockQty || 0;
      const returnQty = Math.abs(parseInt(quantity, 10));

      // For returns, quantity must be positive (inflow)
      const changeQty = returnQty;

      console.log(`\n🔄 [INVENTORY] Restoring stock for product ${productId}`);
      console.log(`   Product Name: ${product.name}`);
      console.log(`   Previous Stock: ${previousStock}`);
      console.log(`   Return Quantity: ${returnQty}`);
      console.log(`   Expected New Stock: ${previousStock + returnQty}`);

      // Create StockChange - type 'return' for restoring stock from returned items
      const stockChange = new StockChange({
        companyId,
        shopId: shopId || product.shopId,
        productId: productId, // Already ObjectId or handled
        variationId: null, // Master product, no variation
        type: 'return', // Use 'return' type for restoring stock from returns
        qty: changeQty, // Positive for inflow
        previous: previousStock,
        reason: `Return ${returnId} for sale ${saleId}`,
        userId: 'system',
        meta: {
          returnId: returnId,
          saleId: saleId,
          productName: product.name,
          categoryId: product.categoryId,
          unitCost: product.pricingId?.cost || 0
        }
        // 'new' will be calculated by pre-save hook
      });

      console.log(`   Creating StockChange record...`);
      await stockChange.save(); // Pre-save hook updates ProductStock atomically
      console.log(`   ✅ StockChange saved successfully`);

      // Get updated stock after save
      const updatedStock = await ProductStock.findOne({
        productId: productId,
        variationId: null
      });

      const newStock = updatedStock ? updatedStock.stockQty : previousStock + changeQty;

      console.log(`   ✅ Stock Updated: ${previousStock} → ${newStock}`);
      console.log(`   📊 Verification: Expected ${previousStock + returnQty}, Got ${newStock}\n`);

      logger.info(`➕ Stock restored for returned product ${productId}: ${previousStock} → ${newStock} (return ${returnId})`, {
        returnId,
        saleId,
        productName: product.name,
        quantity: returnQty
      });

      // Emit inventory events
      await publishProductEvent('inventory.product.updated', {
        _id: product._id,
        companyId: product.companyId,
        productId: product._id,
        name: product.name,
        productName: product.name,
        categoryId: product.categoryId,
        sku: product.sku
      });
      await publishProductEvent('inventory.stock.updated', {
        productId: product._id,
        companyId: product.companyId,
        shopId: shopId || product.shopId,
        oldQuantity: previousStock,
        newQuantity: newStock,
        quantityChange: changeQty, // +ve for restore
        type: 'RETURN',
        unitCost: item.costPrice || 0, // Assuming cost is available or 0
        productName: product.name,
        categoryId: product.categoryId,
        traceId: traceId || data.traceId
      });

      // Emit restocked event if stock was restored from zero
      if (previousStock === 0 && newStock > 0) {
        await publishProductEvent('inventory.restocked', {
          productId: product._id,
          companyId: product.companyId,
          productName: product.name,
          quantity: returnQty
        });
      }

      results.push({ productId, status: 'success', oldQuantity: previousStock, newQuantity: newStock });
    } catch (error) {
      logger.error(`❌ Error restoring stock for returned product ${productId}:`, error);
      results.push({ productId, status: 'error', error: error.message });
    }
  }

  return results;
}

/**
 * Handle restore stock event - Direct stock restoration without confirmation
 * This event is sent from sales service when a return is created
 * Inventory service restores stock immediately
 */
async function handleRestoreStock(data) {
  const { returnId, saleId, items, traceId, companyId, shopId } = data;

  console.log(`\n${'='.repeat(80)}`);
  console.log(`📦 [INVENTORY] Received sale.return.restore_stock event`);
  console.log(`${'='.repeat(80)}`);
  console.log(`Return ID: ${returnId}`);
  console.log(`Sale ID: ${saleId}`);
  console.log(`Company ID: ${companyId}`);
  console.log(`Shop ID: ${shopId}`);
  console.log(`Items Count: ${items?.length || 0}`);
  console.log(`Items:`, JSON.stringify(items, null, 2));
  console.log(`${'='.repeat(80)}\n`);

  logger.info(`📦 [sale.return.restore_stock] Restoring stock for return ${returnId}`, {
    traceId,
    companyId,
    saleId,
    shopId,
    itemsCount: items?.length || 0
  });

  if (!items || !Array.isArray(items) || items.length === 0) {
    logger.warn(`⚠️ Return ${returnId} has no items to restore`);
    return { success: false, message: 'No items to process' };
  }

  if (!companyId) {
    logger.error(`❌ Missing companyId in return ${returnId}`);
    return { success: false, message: 'Missing required field: companyId' };
  }

  try {
    // Process the return - restore stock directly
    const results = await handleSaleReturnFullyReturned(data);

    const successfulItems = results.filter(r => r.status === 'success');
    const failedItems = results.filter(r => r.status !== 'success');

    console.log(`\n✅ [INVENTORY] Stock restoration completed for return ${returnId}`);
    console.log(`   Successful: ${successfulItems.length}/${items.length} items`);
    if (failedItems.length > 0) {
      console.log(`   Failed: ${failedItems.length} items`);
      failedItems.forEach(item => {
        console.log(`      - ${item.productId}: ${item.error || item.status}`);
      });
    }
    console.log(`\n`);

    return {
      success: successfulItems.length > 0,
      message: `Restored ${successfulItems.length}/${items.length} items`,
      results
    };
  } catch (error) {
    logger.error(`❌ Error restoring stock for return ${returnId}:`, error);
    console.error(`❌ [INVENTORY] Error restoring stock:`, error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Handle sale return inventory confirmation request (DEPRECATED - kept for backward compatibility)
 * This event is sent from sales service when a return is created
 * Inventory service processes it, restores stock, and confirms the return
 */
async function handleInventoryConfirmationRequest(data) {
  const { returnId, saleId, items, traceId, companyId, shopId } = data;

  console.log(`\n${'='.repeat(80)}`);
  console.log(`📦 [INVENTORY] Received return confirmation request`);
  console.log(`${'='.repeat(80)}`);
  console.log(`Return ID: ${returnId}`);
  console.log(`Sale ID: ${saleId}`);
  console.log(`Company ID: ${companyId}`);
  console.log(`Shop ID: ${shopId}`);
  console.log(`Items Count: ${items?.length || 0}`);
  console.log(`Items:`, JSON.stringify(items, null, 2));
  console.log(`${'='.repeat(80)}\n`);

  logger.info(`📦 [sale.return.inventory.confirmation.requested] Processing return confirmation request ${returnId}`, {
    traceId,
    companyId,
    saleId,
    shopId,
    itemsCount: items?.length || 0
  });

  if (!items || !Array.isArray(items) || items.length === 0) {
    logger.warn(`⚠️ Return confirmation request ${returnId} has no items`);

    // Emit rejection event
    await publishProductEvent('inventory.return.rejected', {
      returnId,
      saleId,
      companyId,
      reason: 'No items to process'
    });

    return { success: false, message: 'No items to process' };
  }

  if (!companyId) {
    logger.error(`❌ Missing companyId in return confirmation request ${returnId}`);

    // Emit rejection event
    await publishProductEvent('inventory.return.rejected', {
      returnId,
      saleId,
      companyId: companyId || 'unknown',
      reason: 'Missing required field: companyId'
    });

    return { success: false, message: 'Missing required field: companyId' };
  }

  try {
    // Process the return - restore stock
    const results = await handleSaleReturnFullyReturned(data);

    // Check if all items were successfully processed
    const successfulItems = results.filter(r => r.status === 'success');
    const failedItems = results.filter(r => r.status !== 'success');

    if (successfulItems.length === items.length) {
      // All items successfully returned - emit confirmation event
      console.log(`\n✅ [INVENTORY] All items successfully returned for return ${returnId}`);
      console.log(`   Publishing inventory.return.confirmed event to sales service...`);

      logger.info(`✅ All items successfully returned for return ${returnId}`, {
        returnId,
        saleId,
        itemsCount: successfulItems.length
      });

      await publishProductEvent('inventory.return.confirmed', {
        returnId,
        saleId,
        companyId,
        confirmedItems: successfulItems.map(item => ({
          productId: item.productId,
          oldQuantity: item.oldQuantity,
          newQuantity: item.newQuantity
        })),
        confirmedAt: new Date().toISOString()
      });

      console.log(`   ✅ Event published successfully\n`);

      return { success: true, message: 'All items returned successfully', results };
    } else if (successfulItems.length > 0) {
      // Partial success - emit partial confirmation event
      logger.warn(`⚠️ Partial return for return ${returnId}: ${successfulItems.length}/${items.length} items`, {
        returnId,
        saleId,
        successfulCount: successfulItems.length,
        failedCount: failedItems.length
      });

      await publishProductEvent('inventory.return.partially_received', {
        returnId,
        saleId,
        companyId,
        receivedItems: successfulItems.map(item => ({
          productId: item.productId,
          oldQuantity: item.oldQuantity,
          newQuantity: item.newQuantity
        })),
        rejectedItems: failedItems.map(item => ({
          productId: item.productId,
          reason: item.error || item.status
        })),
        receivedAt: new Date().toISOString()
      });

      return { success: true, message: 'Partial return processed', results };
    } else {
      // All items failed - emit rejection event
      logger.error(`❌ All items failed for return ${returnId}`, {
        returnId,
        saleId,
        failedCount: failedItems.length
      });

      await publishProductEvent('inventory.return.rejected', {
        returnId,
        saleId,
        companyId,
        reason: 'All items failed to process',
        failedItems: failedItems.map(item => ({
          productId: item.productId,
          reason: item.error || item.status
        }))
      });

      return { success: false, message: 'All items failed to process', results };
    }
  } catch (error) {
    logger.error(`❌ Error processing return confirmation request ${returnId}:`, error);

    // Emit rejection event
    await publishProductEvent('inventory.return.rejected', {
      returnId,
      saleId,
      companyId,
      reason: error.message
    });

    return { success: false, message: error.message };
  }
}

/**
 * Main handler function for sales events
 * Includes automatic deduplication logic
 * @param {object} event - The event object (may have type, data, or payload)
 * @param {string} routingKey - The routing key (e.g., "sale.created")
 */
module.exports = async function handleSalesEvent(event, routingKey) {
  try {
    // Extract type from routingKey (primary) or event.type (fallback)
    const type = routingKey || event?.type;

    // Extract data from event - check multiple possible structures
    // Event might be: { type, data } or { type, payload } or just the data itself
    let eventData = event?.data || event?.payload || event;

    if (!type) {
      logger.error('❌ Event type/routingKey is missing', { event: JSON.stringify(event), routingKey });
      return;
    }

    if (!eventData) {
      logger.error('❌ Event data/payload is missing', { event: JSON.stringify(event), routingKey });
      return;
    }

    // Log the received event structure for debugging
    logger.info(`📥 Received sales event: ${type}`, {
      routingKey,
      eventType: event?.type,
      hasData: !!event?.data,
      hasPayload: !!event?.payload,
      saleId: eventData.saleId,
      itemsCount: eventData.items?.length || 0
    });

    // Generate event ID for deduplication
    const traceId = eventData.traceId || eventData.trace_id;
    const fallbackId = eventData.saleId || eventData.orderId || eventData.returnId || eventData.id || '';
    const eventId = traceId || `${type}:${fallbackId}`;

    logger.info(`💰 Processing sales event: ${type}`, { eventId, saleId: eventData.saleId });

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

          case 'sale.return.restore_stock':
            return await handleRestoreStock(eventData);

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
    logger.error(`❌ Error handling sales event: ${error.message}`, { error, event: JSON.stringify(event), routingKey });
    throw error;
  }
};
