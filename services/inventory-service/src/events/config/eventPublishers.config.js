/**
 * Event Publishers Configuration
 * Defines all events that inventory-service publishes
 * Used by producer.js to initialize publishers
 * Format: Array of publisher configs, each with events array
 */

/**
 * Event Publishers Configuration
 *
 * This file registers all routing keys the inventory-service will publish.
 * Several parts of the code emit dotted routing keys (e.g. `inventory.product.created`).
 * Ensure we include the dotted variants used throughout the codebase so that
 * `registerPublishers` can find a matching publisher for emitted events.
 */

module.exports = {
  // Product Events
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
  'product.exposed': {
    exchange: 'events_topic',
    routingKey: 'product.exposed',
    description: 'Published when a product becomes publicly exposed'
  },

  // Inventory Product Events (dotted keys used across code)
  'inventory.product.created': {
    exchange: 'events_topic',
    routingKey: 'inventory.product.created',
    description: 'Published when a new inventory product is created'
  },
  'inventory.product.updated': {
    exchange: 'events_topic',
    routingKey: 'inventory.product.updated',
    description: 'Published when an inventory product is updated'
  },
  'inventory.product.deleted': {
    exchange: 'events_topic',
    routingKey: 'inventory.product.deleted',
    description: 'Published when an inventory product is deleted'
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

  // Stock Events (dotted keys)
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

  // Alert Events
  'inventory.alert.triggered': {
    exchange: 'events_topic',
    routingKey: 'inventory.alert.triggered',
    description: 'Published when an inventory alert is triggered'
  }
};
