/**
 * Sales Event Handler
 * Handles inventory-related events from sales-service
 * Manages stock updates when orders are created, cancelled, or returned
 */

const Product = require('../../models/Product');
const { logger } = require('../../utils/logger');
const producer = require('../../events/producer');
const ProcessedEvent = require('../../models/ProcessedEvent');

/**
 * Handle order created event - Reduce inventory
 */
async function handleOrderCreated(data) {
  try {
    console.log(`📦 Processing order created with data:`, JSON.stringify(data, null, 2));

    const { orderId, saleId, companyId, items } = data;

    if (!items || !Array.isArray(items)) {
      console.warn(`⚠️ Invalid items in order created event. Items:`, items);
      return;
    }

    console.log(`📦 Processing order created: ${orderId || saleId} with ${items.length} items`);

    for (const item of items) {
      const { productId, quantity } = item;

      if (!productId) {
        console.warn(`⚠️ Item missing productId:`, item);
        continue;
      }

      const product = await Product.findById(productId);
      if (!product) {
        console.warn(`⚠️ Product not found: ${productId}`);
        continue;
      }

      // Reduce inventory
      const oldQuantity = product.inventory.quantity;
      product.inventory.quantity = Math.max(0, oldQuantity - quantity);

      await product.save();

      // Publish stock update event so other services (e.g., ecommerce) can sync
      try {
        await producer.emit('inventory.product.updated', product.toObject());
        console.log(`Published inventory.product.updated for ${productId}`);
      } catch (err) {
        console.error(`Failed to publish inventory.product.updated for ${productId}:`, err.message || err);
      }

      console.log(
        `✅ Inventory reduced for product ${productId}: ${oldQuantity} → ${product.inventory.quantity}`
      );
    }
  } catch (error) {
    console.error(`❌ Error handling order created:`, error);
    throw error;
  }
}

/**
 * Handle order cancelled event - Restore inventory
 */
async function handleOrderCancelled(data) {
  try {
    const { orderId, companyId, items } = data;

    if (!items || !Array.isArray(items)) {
      logger.warn(`⚠️ Invalid items in order cancelled event: ${orderId}`);
      return;
    }

    logger.info(`📦 Processing order cancelled: ${orderId}`);

    for (const item of items) {
      const { productId, quantity } = item;

      const product = await Product.findById(productId);
      if (!product) {
        logger.warn(`⚠️ Product not found: ${productId}`);
        continue;
      }

      // Restore inventory
      const oldQuantity = product.inventory.quantity;
      product.inventory.quantity = oldQuantity + quantity;

      await product.save();

      // Publish stock update event
      try {
        await producer.emit('inventory.product.updated', product.toObject());
        logger.info(`Published inventory.product.updated for ${productId}`);
      } catch (err) {
        logger.error(`Failed to publish inventory.product.updated for ${productId}: ${err.message || err}`);
      }

      logger.info(
        `✅ Inventory restored for product ${productId}: ${oldQuantity} → ${product.inventory.quantity}`
      );
    }
  } catch (error) {
    logger.error(`❌ Error handling order cancelled: ${error.message}`);
    throw error;
  }
}

/**
 * Handle return confirmed event - Restore inventory
 */
async function handleReturnConfirmed(data) {
  try {
    const { returnId, companyId, items } = data;

    if (!items || !Array.isArray(items)) {
      logger.warn(`⚠️ Invalid items in return confirmed event: ${returnId}`);
      return;
    }

    logger.info(`📦 Processing return confirmed: ${returnId}`);

    for (const item of items) {
      const { productId, quantity } = item;

      const product = await Product.findById(productId);
      if (!product) {
        logger.warn(`⚠️ Product not found: ${productId}`);
        continue;
      }

      // Restore inventory
      const oldQuantity = product.inventory.quantity;
      product.inventory.quantity = oldQuantity + quantity;

      await product.save();

      // Publish stock update event
      try {
        await producer.emit('inventory.product.updated', product.toObject());
        logger.info(`Published inventory.product.updated for returned product ${productId}`);
      } catch (err) {
        logger.error(`Failed to publish inventory.product.updated for returned product ${productId}: ${err.message || err}`);
      }

      logger.info(
        `✅ Inventory restored for returned product ${productId}: ${oldQuantity} → ${product.inventory.quantity}`
      );
    }
  } catch (error) {
    logger.error(`❌ Error handling return confirmed: ${error.message}`);
    throw error;
  }
}

/**
 * Main handler function
 */
module.exports = async function handleSalesEvent(event) {
  try {
    // Log raw event to understand structure
    console.log('🔍 RAW EVENT RECEIVED:', JSON.stringify(event, null, 2));

    // Check if event is defined
    if (!event) {
      console.error('❌ Event is undefined or null');
      return;
    }

    const { type, payload, data } = event;
    const eventData = payload || data;

    console.log(`💳 Processing sales event: ${type}`);
    console.log(`💳 Event data:`, JSON.stringify(eventData, null, 2));

    if (!type) {
      console.error('❌ Event type is missing');
      return;
    }

    if (!eventData) {
      console.error('❌ Event data/payload is missing');
      return;
    }

    // Idempotency: derive a stable key (prefer traceId, fallback to type+entity id)
    const traceId = eventData.traceId || eventData.trace_id;
    const fallbackId = eventData.saleId || eventData.orderId || eventData.returnId || eventData.id || '';
    const dedupKey = traceId || `${type}:${fallbackId}`;

    if (!dedupKey) {
      logger.warn('⚠️ No deduplication key found for event; proceeding without idempotency');
    } else {
      const existing = await ProcessedEvent.findOne({ key: dedupKey });
      if (existing) {
        logger.info(`ℹ️ Duplicate event ignored (key=${dedupKey})`);
        return; // already processed
      }
    }

    switch (type) {
      case 'sale.created':
        await handleOrderCreated(eventData);
        break;

      case 'sale.canceled':
      case 'sale.cancelled':
        await handleOrderCancelled(eventData);
        break;

      case 'sale.return.confirmed':
        await handleReturnConfirmed(eventData);
        break;

      default:
        console.warn(`⚠️ Unhandled sales event type: ${type}`);
    }

    // Mark event as processed for idempotency
    try {
      if (dedupKey) {
        await ProcessedEvent.create({ key: dedupKey, type, payloadSummary: { saleId: eventData.saleId, orderId: eventData.orderId } });
        logger.info(`✅ Marked event processed (key=${dedupKey})`);
      }
    } catch (err) {
      // Ignore duplicate key errors (race), log others
      if (err.code === 11000) {
        logger.warn(`⚠️ ProcessedEvent race: key already exists ${dedupKey}`);
      } else {
        logger.error(`❌ Failed to persist processed event key ${dedupKey}: ${err.message || err}`);
      }
    }
  } catch (err) {
    console.error(`❌ Error handling sales event:`, err);
    throw err;
  }
};
