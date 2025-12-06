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
          companyAdminId: company.company_admin_id, // Explicit company admin ID
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

const departmentUserEvents = {
  /**
   * Create outbox event for user assigned to department
   */
  async assigned(userId, departmentId, companyId, role, trx = null) {
    return await Outbox.create(
      {
        type: "department_user.assigned",
        exchange: "events_topic",
        routingKey: "department_user.assigned",
        payload: {
          userId,
          departmentId,
          companyId,
          role, // 'seller' or 'manager'
          assignedAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },

  /**
   * Create outbox event for user role change in department
   */
  async roleChanged(userId, departmentId, companyId, role, trx = null) {
    return await Outbox.create(
      {
        type: "department_user.role_changed",
        exchange: "events_topic",
        routingKey: "department_user.role_changed",
        payload: {
          userId,
          departmentId,
          companyId,
          role,
          changedAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },

  /**
   * Create outbox event for user suspended from department
   */
  async suspended(userId, departmentId, companyId, trx = null) {
    return await Outbox.create(
      {
        type: "department_user.suspended",
        exchange: "events_topic",
        routingKey: "department_user.suspended",
        payload: {
          userId,
          departmentId,
          companyId,
          suspendedAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },

  /**
   * Create outbox event for user removed from department
   */
  async removed(userId, departmentId, companyId, trx = null) {
    return await Outbox.create(
      {
        type: "department_user.removed",
        exchange: "events_topic",
        routingKey: "department_user.removed",
        payload: {
          userId,
          departmentId,
          companyId,
          removedAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },

  /**
   * Create outbox event for all users removed from company
   */
  async removedFromCompany(companyId, trx = null) {
    return await Outbox.create(
      {
        type: "department_user.removed_from_company",
        exchange: "events_topic",
        routingKey: "department_user.removed_from_company",
        payload: {
          companyId,
          removedAt: new Date().toISOString(),
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
  departmentUserEvents,
};
