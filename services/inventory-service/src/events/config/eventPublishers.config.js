/**
 * Event Publishers Configuration
 * Defines all events that inventory-service publishes
 * Used by producer.js to initialize publishers
 * Format: Array of publisher configs, each with events array
 */

module.exports = {
  // Product Events (5)
  'product.created': {
    exchange: 'events_topic',
    routingKey: 'product.created',
    description: 'Published when a new product is created'
  },

  'product.updated': {
    exchange: 'events_topic',
    routingKey: 'product.updated',
    description: 'Published when product details are updated'
  },

  'product.deleted': {
    exchange: 'events_topic',
    routingKey: 'product.deleted',
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

  'inventory.low_stock': {
    exchange: 'events_topic',
    routingKey: 'inventory.low_stock',
    description: 'Published when stock falls below threshold'
  },

  'inventory.out_of_stock': {
    exchange: 'events_topic',
    routingKey: 'inventory.out_of_stock',
    description: 'Published when stock reaches zero'
  },

  'inventory.restocked': {
    exchange: 'events_topic',
    routingKey: 'inventory.restocked',
    description: 'Published when stock is replenished'
  },

  // Warehouse Events (2)
  // Warehouse events removed - warehouses are no longer part of the service

  // Alert Events (1)
  'inventory.alert.triggered': {
    exchange: 'events_topic',
    routingKey: 'inventory.alert.triggered',
    description: 'Published when an inventory alert is triggered'
  }
};
