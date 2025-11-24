"use strict";

const { Outbox } = require("../models/index.model");
const { v4: uuidv4 } = require("uuid");

/**
 * Shop event helpers - Create outbox events for shop operations
 */
const shopEvents = {
  /**
   * Shop created event
   */
  async created(shop, trx = null) {
    return await Outbox.create(
      {
        type: "shop.created",
        exchange: "events_topic",
        routingKey: "shop.created",
        payload: {
          shopId: shop.id,
          companyId: shop.company_id,
          name: shop.name,
          location: {
            address: shop.address_line1,
            address2: shop.address_line2,
            city: shop.city,
            region: shop.region,
            country: shop.country,
            postal_code: shop.postal_code,
            latitude: shop.latitude,
            longitude: shop.longitude,
          },
          capacity: shop.capacity,
          timezone: shop.timezone,
          status: shop.status,
          createdAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },

  /**
   * Shop updated event
   */
  async updated(shop, trx = null) {
    return await Outbox.create(
      {
        type: "shop.updated",
        exchange: "events_topic",
        routingKey: "shop.updated",
        payload: {
          shopId: shop.id,
          companyId: shop.company_id,
          name: shop.name,
          city: shop.city,
          country: shop.country,
          status: shop.status,
          updatedAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },

  /**
   * Shop status changed event
   */
  async statusChanged(shopId, companyId, oldStatus, newStatus, trx = null) {
    return await Outbox.create(
      {
        type: "shop.status.changed",
        exchange: "events_topic",
        routingKey: "shop.status.changed",
        payload: {
          shopId,
          companyId,
          oldStatus,
          status: newStatus, // Add 'status' field for inventory service
          newStatus,
          changedAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },

  /**
   * Shop deleted/closed event
   */
  async deleted(shopId, companyId, trx = null) {
    return await Outbox.create(
      {
        type: "shop.deleted",
        exchange: "events_topic",
        routingKey: "shop.deleted",
        payload: {
          shopId,
          companyId,
          deletedAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },

  /**
   * Shop settings updated event
   */
  async settingsUpdated(shopId, companyId, settings, trx = null) {
    return await Outbox.create(
      {
        type: "shop.settings.updated",
        exchange: "events_topic",
        routingKey: "shop.settings.updated",
        payload: {
          shopId,
          companyId,
          settings,
          updatedAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },
};

/**
 * Department event helpers
 */
const departmentEvents = {
  /**
   * Department created event
   */
  async created(department, shopId, companyId, trx = null) {
    return await Outbox.create(
      {
        type: "shop.department.created",
        exchange: "events_topic",
        routingKey: "shop.department.created",
        payload: {
          departmentId: department.id,
          shopId,
          companyId,
          name: department.name,
          capacity: department.capacity,
          createdAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },

  /**
   * Department updated event
   */
  async updated(department, shopId, companyId, trx = null) {
    return await Outbox.create(
      {
        type: "shop.department.updated",
        exchange: "events_topic",
        routingKey: "shop.department.updated",
        payload: {
          departmentId: department.id,
          shopId,
          companyId,
          name: department.name,
          capacity: department.capacity,
          updatedAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },

  /**
   * Department deleted event
   */
  async deleted(departmentId, shopId, companyId, trx = null) {
    return await Outbox.create(
      {
        type: "shop.department.deleted",
        exchange: "events_topic",
        routingKey: "shop.department.deleted",
        payload: {
          departmentId,
          shopId,
          companyId,
          deletedAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },
};

module.exports = {
  shopEvents,
  departmentEvents,
};
