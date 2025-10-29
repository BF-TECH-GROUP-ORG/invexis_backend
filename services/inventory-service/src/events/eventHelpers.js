/**
 * Event Helpers - Create outbox events for inventory operations
 * All events are created within database transactions for reliability
 */

const Outbox = require('../models/Outbox');
const { v4: uuidv4 } = require('uuid');

/**
 * Product Events
 */
const productEvents = {
  async created(product, companyId, session = null) {
    return await Outbox.create(
      {
        type: 'inventory.product.created',
        exchange: 'events_topic',
        routingKey: 'inventory.product.created',
        payload: {
          productId: product._id,
          companyId,
          name: product.name,
          sku: product.sku,
          category: product.category,
          pricing: product.pricing,
          inventory: product.inventory,
          createdAt: new Date().toISOString(),
          traceId: uuidv4()
        }
      },
      session
    );
  },

  async updated(product, companyId, changes, session = null) {
    return await Outbox.create(
      {
        type: 'inventory.product.updated',
        exchange: 'events_topic',
        routingKey: 'inventory.product.updated',
        payload: {
          productId: product._id,
          companyId,
          name: product.name,
          changes,
          updatedAt: new Date().toISOString(),
          traceId: uuidv4()
        }
      },
      session
    );
  },

  async deleted(productId, companyId, session = null) {
    return await Outbox.create(
      {
        type: 'inventory.product.deleted',
        exchange: 'events_topic',
        routingKey: 'inventory.product.deleted',
        payload: {
          productId,
          companyId,
          deletedAt: new Date().toISOString(),
          traceId: uuidv4()
        }
      },
      session
    );
  },

  async priceChanged(product, companyId, oldPrice, newPrice, session = null) {
    return await Outbox.create(
      {
        type: 'inventory.product.price.changed',
        exchange: 'events_topic',
        routingKey: 'inventory.product.price.changed',
        payload: {
          productId: product._id,
          companyId,
          oldPrice,
          newPrice,
          currency: product.pricing.currency,
          changedAt: new Date().toISOString(),
          traceId: uuidv4()
        }
      },
      session
    );
  },

  async statusChanged(product, companyId, oldStatus, newStatus, session = null) {
    return await Outbox.create(
      {
        type: 'inventory.product.status.changed',
        exchange: 'events_topic',
        routingKey: 'inventory.product.status.changed',
        payload: {
          productId: product._id,
          companyId,
          oldStatus,
          newStatus,
          changedAt: new Date().toISOString(),
          traceId: uuidv4()
        }
      },
      session
    );
  }
};

/**
 * Stock Events
 */
const stockEvents = {
  async updated(product, companyId, oldQuantity, newQuantity, session = null) {
    return await Outbox.create(
      {
        type: 'inventory.stock.updated',
        exchange: 'events_topic',
        routingKey: 'inventory.stock.updated',
        payload: {
          productId: product._id,
          companyId,
          oldQuantity,
          newQuantity,
          change: newQuantity - oldQuantity,
          updatedAt: new Date().toISOString(),
          traceId: uuidv4()
        }
      },
      session
    );
  },

  async lowStock(product, companyId, quantity, threshold, session = null) {
    return await Outbox.create(
      {
        type: 'inventory.low.stock',
        exchange: 'events_topic',
        routingKey: 'inventory.low.stock',
        payload: {
          productId: product._id,
          companyId,
          productName: product.name,
          currentQuantity: quantity,
          threshold,
          triggeredAt: new Date().toISOString(),
          traceId: uuidv4()
        }
      },
      session
    );
  },

  async outOfStock(product, companyId, session = null) {
    return await Outbox.create(
      {
        type: 'inventory.out.of.stock',
        exchange: 'events_topic',
        routingKey: 'inventory.out.of.stock',
        payload: {
          productId: product._id,
          companyId,
          productName: product.name,
          triggeredAt: new Date().toISOString(),
          traceId: uuidv4()
        }
      },
      session
    );
  },

  async restocked(product, companyId, quantity, session = null) {
    return await Outbox.create(
      {
        type: 'inventory.restocked',
        exchange: 'events_topic',
        routingKey: 'inventory.restocked',
        payload: {
          productId: product._id,
          companyId,
          productName: product.name,
          quantity,
          restokedAt: new Date().toISOString(),
          traceId: uuidv4()
        }
      },
      session
    );
  }
};

/**
 * Warehouse Events
 */
const warehouseEvents = {
  async created(warehouse, companyId, session = null) {
    return await Outbox.create(
      {
        type: 'inventory.warehouse.created',
        exchange: 'events_topic',
        routingKey: 'inventory.warehouse.created',
        payload: {
          warehouseId: warehouse._id,
          companyId,
          name: warehouse.name,
          location: warehouse.location,
          createdAt: new Date().toISOString(),
          traceId: uuidv4()
        }
      },
      session
    );
  },

  async updated(warehouse, companyId, changes, session = null) {
    return await Outbox.create(
      {
        type: 'inventory.warehouse.updated',
        exchange: 'events_topic',
        routingKey: 'inventory.warehouse.updated',
        payload: {
          warehouseId: warehouse._id,
          companyId,
          name: warehouse.name,
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
 * Alert Events
 */
const alertEvents = {
  async triggered(alert, companyId, session = null) {
    return await Outbox.create(
      {
        type: 'inventory.alert.triggered',
        exchange: 'events_topic',
        routingKey: 'inventory.alert.triggered',
        payload: {
          alertId: alert._id,
          companyId,
          type: alert.type,
          message: alert.message,
          productId: alert.productId,
          triggeredAt: new Date().toISOString(),
          traceId: uuidv4()
        }
      },
      session
    );
  }
};

module.exports = {
  productEvents,
  stockEvents,
  warehouseEvents,
  alertEvents
};

