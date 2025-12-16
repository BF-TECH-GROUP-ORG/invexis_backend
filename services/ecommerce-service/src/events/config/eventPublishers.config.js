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

  'ecommerce.cart.checked_out': {
    exchange: 'events_topic',
    routingKey: 'ecommerce.cart.checked_out',
    description: 'Published when a cart has been checked out'
  },

  'ecommerce.payment.request': {
    exchange: 'events_topic',
    routingKey: 'ecommerce.payment.request',
    description: 'Published when a payment should be initiated for a cart/order'
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

  'ecommerce.promotion.updated': {
    exchange: 'events_topic',
    routingKey: 'ecommerce.promotion.updated',
    description: 'Published when a promotion is updated'
  },

  'ecommerce.promotion.deleted': {
    exchange: 'events_topic',
    routingKey: 'ecommerce.promotion.deleted',
    description: 'Published when a promotion is deleted'
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

  // Catalog events
  'ecommerce.catalog.created': {
    exchange: 'events_topic',
    routingKey: 'ecommerce.catalog.created',
    description: 'Published when catalog/product is created'
  },

  'ecommerce.catalog.updated': {
    exchange: 'events_topic',
    routingKey: 'ecommerce.catalog.updated',
    description: 'Published when catalog/product is updated'
  },

  // Banner Events (1)
  'ecommerce.banner.activated': {
    exchange: 'events_topic',
    routingKey: 'ecommerce.banner.activated',
    description: 'Published when a banner is activated'
  }
  ,
  'ecommerce.banner.created': {
    exchange: 'events_topic',
    routingKey: 'ecommerce.banner.created',
    description: 'Published when a banner is created'
  },

  'ecommerce.banner.updated': {
    exchange: 'events_topic',
    routingKey: 'ecommerce.banner.updated',
    description: 'Published when a banner is updated'
  },

  'ecommerce.banner.deleted': {
    exchange: 'events_topic',
    routingKey: 'ecommerce.banner.deleted',
    description: 'Published when a banner is deleted'
  },

  'ecommerce.banner.toggled': {
    exchange: 'events_topic',
    routingKey: 'ecommerce.banner.toggled',
    description: 'Published when a banner is toggled active/inactive'
  },

  // Orders
  'ecommerce.order.created': {
    exchange: 'events_topic',
    routingKey: 'ecommerce.order.created',
    description: 'Published when a new order is placed'
  },

  'ecommerce.order.updated': {
    exchange: 'events_topic',
    routingKey: 'ecommerce.order.updated',
    description: 'Published when an order is updated'
  },

  // Reviews
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

  'ecommerce.review.deleted': {
    exchange: 'events_topic',
    routingKey: 'ecommerce.review.deleted',
    description: 'Published when a review is deleted'
  }
};