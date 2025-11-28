/**
 * Event Publishers Configuration
 * Defines all events that inventory-service publishes
 * Used by producer.js to initialize publishers
 * Format: Array of publisher configs, each with events array
 */

module.exports = [
  {
    name: 'Product Events Publisher',
    exchange: 'events_topic',
    events: [
      {
        key: 'inventory.product.created',
        description: 'Published when a new product is created'
      },
      {
        key: 'inventory.product.updated',
        description: 'Published when product details are updated'
      },
      {
        key: 'inventory.product.deleted',
        description: 'Published when a product is soft deleted'
      },
      {
        key: 'inventory.product.price.changed',
        description: 'Published when product price is updated'
      },
      {
        key: 'inventory.product.status.changed',
        description: 'Published when product status changes (active/inactive)'
      }
    ]
  },
  {
    name: 'Stock Events Publisher',
    exchange: 'events_topic',
    events: [
      {
        key: 'inventory.stock.updated',
        description: 'Published when stock quantity is updated'
      },
      {
        key: 'inventory.low.stock',
        description: 'Published when stock falls below threshold'
      },
      {
        key: 'inventory.out.of.stock',
        description: 'Published when stock reaches zero'
      },
      {
        key: 'inventory.restocked',
        description: 'Published when stock is replenished'
      }
    ]
  },
  {
    name: 'Alert Events Publisher',
    exchange: 'events_topic',
    events: [
      {
        key: 'inventory.alert.triggered',
        description: 'Published when an inventory alert is triggered'
      }
    ]
  }
];

