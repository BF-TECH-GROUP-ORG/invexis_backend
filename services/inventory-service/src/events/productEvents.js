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
    await producer.emit(eventType, data);
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