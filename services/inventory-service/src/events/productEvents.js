/**
 * Product Event Publisher
 * Publishes product CRUD events to RabbitMQ topic exchange
 * for consumption by other services (ecommerce, etc.)
 */

const producer = require('./producer');
const logger = require('../utils/logger');

/**
 * Publish product event to topic exchange
 * @param {String} eventType - Event type (e.g., 'inventory.product.created')
 * @param {Object} data - Product data to publish (full product object)
 */
const publishProductEvent = async (eventType, data) => {
  try {
    // Emit using the producer which uses eventPublishers.config for routing
    // Provide useful metadata (companyId/shopId/traceId) to the underlying publisher
    const metadata = {
      companyId: data.companyId || data.payload?.companyId || null,
      shopId: data.shopId || data.payload?.shopId || null,
      traceId: data.traceId || data.payload?.traceId || null
    };
    await producer.emit(eventType, data, metadata);
    logger.info(`📤 [PRODUCT EVENT] Published: ${eventType}`, {
      productId: data._id,
      productName: data.name,
      companyId: data.companyId
    });
  } catch (error) {
    logger.error(`❌ [PRODUCT EVENT] Failed to publish ${eventType}:`, error);
    // Don't throw - allow product operation to complete even if event publication fails
  }
};

module.exports = { publishProductEvent };