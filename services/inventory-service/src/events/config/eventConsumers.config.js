/**
 * Event Consumers Configuration
 * Defines all events that inventory-service consumes from other services
 * Used by consumer.js to register consumers
 */

module.exports = {
  // Sales Service Events (3)
  sales: {
    queue: 'inventory_sales_events',
    exchange: 'events_topic',
    pattern: 'sales.#',
    handler: require('../handlers/salesEvent.handler'),
    events: [
      'sales.order.created',
      'sales.order.cancelled',
      'sales.return.confirmed'
    ]
  },

  // Shop Service Events (2)
  shop: {
    queue: 'inventory_shop_events',
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
    queue: 'inventory_company_events',
    exchange: 'events_topic',
    pattern: 'company.#',
    handler: require('../handlers/companyEvent.handler'),
    events: [
      'company.deleted'
    ]
  }
};

