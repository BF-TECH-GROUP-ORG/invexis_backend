/**
 * Event Helpers - Create outbox events for ecommerce operations
 * All events are created within database transactions for reliability
 */

const Outbox = require('../models/Outbox.models');
const { v4: uuidv4 } = require('uuid');

/**
 * Cart Events
 */
const cartEvents = {
  async created(cart, companyId, session = null) {
    return await Outbox.create(
      {
        type: 'ecommerce.cart.created',
        exchange: 'events_topic',
        routingKey: 'ecommerce.cart.created',
        payload: {
          cartId: cart._id,
          companyId,
          shopId: cart.shopId,
          itemCount: cart.items.length,
          createdAt: new Date().toISOString(),
          traceId: uuidv4()
        }
      },
      session
    );
  },

  async updated(cart, companyId, changes, session = null) {
    return await Outbox.create(
      {
        type: 'ecommerce.cart.updated',
        exchange: 'events_topic',
        routingKey: 'ecommerce.cart.updated',
        payload: {
          cartId: cart._id,
          companyId,
          itemCount: cart.items.length,
          changes,
          updatedAt: new Date().toISOString(),
          traceId: uuidv4()
        }
      },
      session
    );
  },

  async abandoned(cartId, companyId, session = null) {
    return await Outbox.create(
      {
        type: 'ecommerce.cart.abandoned',
        exchange: 'events_topic',
        routingKey: 'ecommerce.cart.abandoned',
        payload: {
          cartId,
          companyId,
          abandonedAt: new Date().toISOString(),
          traceId: uuidv4()
        }
      },
      session
    );
  }
};

/**
 * Order Events
 */
const orderEvents = {
  async created(order, companyId, session = null) {
    return await Outbox.create(
      {
        type: 'ecommerce.order.created',
        exchange: 'events_topic',
        routingKey: 'ecommerce.order.created',
        payload: {
          orderId: order._id,
          companyId,
          userId: order.userId,
          shopId: order.shopId,
          totalAmount: order.totalAmount,
          itemCount: order.items.length,
          status: order.status,
          createdAt: new Date().toISOString(),
          traceId: uuidv4()
        }
      },
      session
    );
  },

  async confirmed(order, companyId, session = null) {
    return await Outbox.create(
      {
        type: 'ecommerce.order.confirmed',
        exchange: 'events_topic',
        routingKey: 'ecommerce.order.confirmed',
        payload: {
          orderId: order._id,
          companyId,
          status: 'confirmed',
          confirmedAt: new Date().toISOString(),
          traceId: uuidv4()
        }
      },
      session
    );
  },

  async shipped(order, companyId, trackingNumber, session = null) {
    return await Outbox.create(
      {
        type: 'ecommerce.order.shipped',
        exchange: 'events_topic',
        routingKey: 'ecommerce.order.shipped',
        payload: {
          orderId: order._id,
          companyId,
          trackingNumber,
          status: 'shipped',
          shippedAt: new Date().toISOString(),
          traceId: uuidv4()
        }
      },
      session
    );
  },

  async delivered(order, companyId, session = null) {
    return await Outbox.create(
      {
        type: 'ecommerce.order.delivered',
        exchange: 'events_topic',
        routingKey: 'ecommerce.order.delivered',
        payload: {
          orderId: order._id,
          companyId,
          status: 'delivered',
          deliveredAt: new Date().toISOString(),
          traceId: uuidv4()
        }
      },
      session
    );
  },

  async cancelled(order, companyId, reason, session = null) {
    return await Outbox.create(
      {
        type: 'ecommerce.order.cancelled',
        exchange: 'events_topic',
        routingKey: 'ecommerce.order.cancelled',
        payload: {
          orderId: order._id,
          companyId,
          reason,
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
          traceId: uuidv4()
        }
      },
      session
    );
  }
};

/**
 * Review Events
 */
const reviewEvents = {
  async created(review, companyId, session = null) {
    return await Outbox.create(
      {
        type: 'ecommerce.review.created',
        exchange: 'events_topic',
        routingKey: 'ecommerce.review.created',
        payload: {
          reviewId: review._id,
          companyId,
          productId: review.productId,
          rating: review.rating,
          createdAt: new Date().toISOString(),
          traceId: uuidv4()
        }
      },
      session
    );
  },

  async approved(review, companyId, session = null) {
    return await Outbox.create(
      {
        type: 'ecommerce.review.approved',
        exchange: 'events_topic',
        routingKey: 'ecommerce.review.approved',
        payload: {
          reviewId: review._id,
          companyId,
          productId: review.productId,
          approvedAt: new Date().toISOString(),
          traceId: uuidv4()
        }
      },
      session
    );
  }
};

/**
 * Promotion Events
 */
const promotionEvents = {
  async created(promotion, companyId, session = null) {
    return await Outbox.create(
      {
        type: 'ecommerce.promotion.created',
        exchange: 'events_topic',
        routingKey: 'ecommerce.promotion.created',
        payload: {
          promotionId: promotion._id,
          companyId,
          code: promotion.code,
          discount: promotion.discount,
          createdAt: new Date().toISOString(),
          traceId: uuidv4()
        }
      },
      session
    );
  },

  async expired(promotion, companyId, session = null) {
    return await Outbox.create(
      {
        type: 'ecommerce.promotion.expired',
        exchange: 'events_topic',
        routingKey: 'ecommerce.promotion.expired',
        payload: {
          promotionId: promotion._id,
          companyId,
          code: promotion.code,
          expiredAt: new Date().toISOString(),
          traceId: uuidv4()
        }
      },
      session
    );
  }
};

/**
 * Wishlist Events
 */
const wishlistEvents = {
  async created(wishlist, companyId, session = null) {
    return await Outbox.create(
      {
        type: 'ecommerce.wishlist.created',
        exchange: 'events_topic',
        routingKey: 'ecommerce.wishlist.created',
        payload: {
          wishlistId: wishlist._id,
          companyId,
          itemCount: wishlist.items.length,
          createdAt: new Date().toISOString(),
          traceId: uuidv4()
        }
      },
      session
    );
  },

  async updated(wishlist, companyId, changes, session = null) {
    return await Outbox.create(
      {
        type: 'ecommerce.wishlist.updated',
        exchange: 'events_topic',
        routingKey: 'ecommerce.wishlist.updated',
        payload: {
          wishlistId: wishlist._id,
          companyId,
          itemCount: wishlist.items.length,
          changes,
          updatedAt: new Date().toISOString(),
          traceId: uuidv4()
        }
      },
      session
    );
  }
};

/**
 * Banner Events
 */
const bannerEvents = {
  async activated(banner, companyId, session = null) {
    return await Outbox.create(
      {
        type: 'ecommerce.banner.activated',
        exchange: 'events_topic',
        routingKey: 'ecommerce.banner.activated',
        payload: {
          bannerId: banner._id,
          companyId,
          title: banner.title,
          activatedAt: new Date().toISOString(),
          traceId: uuidv4()
        }
      },
      session
    );
  }
};

module.exports = {
  cartEvents,
  orderEvents,
  reviewEvents,
  promotionEvents,
  wishlistEvents,
  bannerEvents
};

