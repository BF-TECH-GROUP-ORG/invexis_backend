/**
 * Event Publishers Configuration
 * Defines all events that inventory-service publishes
 * Used by producer.js to initialize publishers
 */

module.exports = {
  // Product Events (5)
  'inventory.product.created': {
    exchange: 'events_topic',
    routingKey: 'inventory.product.created',
    description: 'Published when a new product is created'
  },

  'inventory.product.updated': {
    exchange: 'events_topic',
    routingKey: 'inventory.product.updated',
    description: 'Published when product details are updated'
  },

  'inventory.product.deleted': {
    exchange: 'events_topic',
    routingKey: 'inventory.product.deleted',
    description: 'Published when a product is soft deleted'
  },

  'inventory.product.price.changed': {
    exchange: 'events_topic',
    routingKey: 'inventory.product.price.changed',
    description: 'Published when product price is updated'
  },

  'inventory.product.status.changed': {
    exchange: 'events_topic',
    routingKey: 'inventory.product.status.changed',
    description: 'Published when product status changes (active/inactive)'
  },

  // Stock Events (4)
  'inventory.stock.updated': {
    exchange: 'events_topic',
    routingKey: 'inventory.stock.updated',
    description: 'Published when stock quantity is updated'
  },

  'inventory.low.stock': {
    exchange: 'events_topic',
    routingKey: 'inventory.low.stock',
    description: 'Published when stock falls below threshold'
  },

  'inventory.out.of.stock': {
    exchange: 'events_topic',
    routingKey: 'inventory.out.of.stock',
    description: 'Published when stock reaches zero'
  },

  'inventory.restocked': {
    exchange: 'events_topic',
    routingKey: 'inventory.restocked',
    description: 'Published when stock is replenished'
  },

  // Warehouse Events (2)
  'inventory.warehouse.created': {
    exchange: 'events_topic',
    routingKey: 'inventory.warehouse.created',
    description: 'Published when a new warehouse is created'
  },

  'inventory.warehouse.updated': {
    exchange: 'events_topic',
    routingKey: 'inventory.warehouse.updated',
    description: 'Published when warehouse details are updated'
  },

  // Alert Events (1)
  'inventory.alert.triggered': {
    exchange: 'events_topic',
    routingKey: 'inventory.alert.triggered',
    description: 'Published when an inventory alert is triggered'
  }
};

