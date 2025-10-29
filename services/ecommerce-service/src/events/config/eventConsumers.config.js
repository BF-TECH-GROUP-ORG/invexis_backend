/**
 * Event Consumers Configuration
 * Defines all events that ecommerce-service consumes from other services
 * Used by consumer.js to register consumers
 */

module.exports = {
  // Inventory Service Events (5)
  inventory: {
    queue: 'ecommerce_inventory_events',
    exchange: 'events_topic',
    pattern: 'inventory.#',
    handler: require('../handlers/inventoryEvent.handler'),
    events: [
      'inventory.product.created',
      'inventory.product.updated',
      'inventory.product.deleted',
      'inventory.stock.updated',
      'inventory.out.of.stock'
    ]
  },

  // Shop Service Events (2)
  shop: {
    queue: 'ecommerce_shop_events',
    exchange: 'events_topic',
    pattern: 'shop.#',
    handler: require('../handlers/shopEvent.handler'),
    events: [
      'shop.created',
      'shop.deleted'
    ]
  },

  // Company Service Events (1)
  company: {
    queue: 'ecommerce_company_events',
    exchange: 'events_topic',
    pattern: 'company.#',
    handler: require('../handlers/companyEvent.handler'),
    events: [
      'company.deleted'
    ]
  }
};

