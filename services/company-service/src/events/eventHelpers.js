"use strict";

const Outbox = require("../models/outbox.model");
const { v4: uuidv4 } = require("uuid");

/**
 * Helper functions to create outbox events in controllers
 * These functions create outbox records that will be published by the dispatcher
 */

const companyEvents = {
  /**
   * Create outbox event for company creation
   */
  async created(company, trx = null) {
    return await Outbox.create(
      {
        type: "company.created",
        exchange: "events_topic",
        routingKey: "company.created",
        payload: {
          companyId: company.id,
          adminId: company.createdBy,
          name: company.name,
          email: company.email,
          phone: company.phone,  // Added for SMS notifications
          fcmToken: company.fcmToken,  // Added for push notifications
          domain: company.domain,
          tier: company.tier,
          createdAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },

  /**
   * Create outbox event for company update
   */
  async updated(company, trx = null) {
    return await Outbox.create(
      {
        type: "company.updated",
        exchange: "events_topic",
        routingKey: "company.updated",
        payload: {
          companyId: company.id,
          name: company.name,
          domain: company.domain,
          tier: company.tier,
          updatedAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },

  /**
   * Create outbox event for company deletion
   */
  async deleted(companyId, trx = null) {
    return await Outbox.create(
      {
        type: "company.deleted",
        exchange: "events_topic",
        routingKey: "company.deleted",
        payload: {
          companyId,
          deletedAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },

  /**
   * Create outbox event for company status change
   */
  async statusChanged(companyId, status, trx = null) {
    return await Outbox.create(
      {
        type: "company.status.changed",
        exchange: "events_topic",
        routingKey: "company.status.changed",
        payload: {
          companyId,
          status,
          changedAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },

  /**
   * Create outbox event for company tier change
   */
  async tierChanged(companyId, tier, trx = null) {
    return await Outbox.create(
      {
        type: "company.tier.changed",
        exchange: "events_topic",
        routingKey: "company.tier.changed",
        payload: {
          companyId,
          tier,
          changedAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },
};

const subscriptionEvents = {
  /**
   * Create outbox event for subscription creation
   */
  async created(subscription, trx = null) {
    return await Outbox.create(
      {
        type: "subscription.created",
        exchange: "events_topic",
        routingKey: "subscription.created",
        payload: {
          subscriptionId: subscription.id,
          companyId: subscription.company_id,
          tier: subscription.tier,
          amount: subscription.amount,
          createdAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },

  /**
   * Create outbox event for subscription update
   */
  async updated(subscription, trx = null) {
    return await Outbox.create(
      {
        type: "subscription.updated",
        exchange: "events_topic",
        routingKey: "subscription.updated",
        payload: {
          subscriptionId: subscription.id,
          companyId: subscription.company_id,
          tier: subscription.tier,
          updatedAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },

  /**
   * Create outbox event for subscription renewal
   */
  async renewed(subscription, trx = null) {
    return await Outbox.create(
      {
        type: "subscription.renewed",
        exchange: "events_topic",
        routingKey: "subscription.renewed",
        payload: {
          subscriptionId: subscription.id,
          companyId: subscription.company_id,
          tier: subscription.tier,
          renewedAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },

  /**
   * Create outbox event for subscription deactivation
   */
  async deactivated(companyId, trx = null) {
    return await Outbox.create(
      {
        type: "subscription.deactivated",
        exchange: "events_topic",
        routingKey: "subscription.deactivated",
        payload: {
          companyId,
          deactivatedAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },

  /**
   * Create outbox event for subscription expiring soon
   */
  async expiring(subscription, trx = null) {
    return await Outbox.create(
      {
        type: "subscription.expiring",
        exchange: "events_topic",
        routingKey: "subscription.expiring",
        payload: {
          subscriptionId: subscription.id,
          companyId: subscription.company_id,
          expiresAt: subscription.end_date,
          traceId: uuidv4(),
        },
      },
      trx
    );
  },
};

module.exports = {
  companyEvents,
  subscriptionEvents,
};
