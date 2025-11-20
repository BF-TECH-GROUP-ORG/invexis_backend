/**
 * Event Publishers Configuration
 * Defines all events that ecommerce-service publishes
 * Used by producer.js to initialize publishers
 */

module.exports = {
  // Cart Events (3)
  'ecommerce.cart.created': {
    exchange: 'events_topic',
    routingKey: 'ecommerce.cart.created',
    description: 'Published when a new cart is created'
  },

  'ecommerce.cart.updated': {
    exchange: 'events_topic',
    routingKey: 'ecommerce.cart.updated',
    description: 'Published when cart items are updated'
  },

  'ecommerce.cart.abandoned': {
    exchange: 'events_topic',
    routingKey: 'ecommerce.cart.abandoned',
    description: 'Published when a cart is abandoned'
  },

  // Order Events (5)
  'ecommerce.order.created': {
    exchange: 'events_topic',
    routingKey: 'ecommerce.order.created',
    description: 'Published when a new order is placed'
  },

  'ecommerce.order.confirmed': {
    exchange: 'events_topic',
    routingKey: 'ecommerce.order.confirmed',
    description: 'Published when order is confirmed'
  },

  'ecommerce.order.shipped': {
    exchange: 'events_topic',
    routingKey: 'ecommerce.order.shipped',
    description: 'Published when order is shipped'
  },

  'ecommerce.order.delivered': {
    exchange: 'events_topic',
    routingKey: 'ecommerce.order.delivered',
    description: 'Published when order is delivered'
  },

  'ecommerce.order.cancelled': {
    exchange: 'events_topic',
    routingKey: 'ecommerce.order.cancelled',
    description: 'Published when order is cancelled'
  },

  // Review Events (2)
  'ecommerce.review.created': {
    exchange: 'events_topic',
    routingKey: 'ecommerce.review.created',
    description: 'Published when a new review is submitted'
  },

  'ecommerce.review.approved': {
    exchange: 'events_topic',
    routingKey: 'ecommerce.review.approved',
    description: 'Published when a review is approved'
  },

  // Promotion Events (2)
  'ecommerce.promotion.created': {
    exchange: 'events_topic',
    routingKey: 'ecommerce.promotion.created',
    description: 'Published when a new promotion is created'
  },

  'ecommerce.promotion.expired': {
    exchange: 'events_topic',
    routingKey: 'ecommerce.promotion.expired',
    description: 'Published when a promotion expires'
  },

  // Wishlist Events (2)
  'ecommerce.wishlist.created': {
    exchange: 'events_topic',
    routingKey: 'ecommerce.wishlist.created',
    description: 'Published when a wishlist is created'
  },

  'ecommerce.wishlist.updated': {
    exchange: 'events_topic',
    routingKey: 'ecommerce.wishlist.updated',
    description: 'Published when wishlist is updated'
  },

  // Banner Events (1)
  'ecommerce.banner.activated': {
    exchange: 'events_topic',
    routingKey: 'ecommerce.banner.activated',
    description: 'Published when a banner is activated'
  }
};

