"use strict";

const db = require("../config"); // Knex instance
const Subscription = require("../models/subscription.model");
const Company = require("../models/company.model");
const Outbox = require("../models/outbox.model");
const { v4: uuidv4 } = require("uuid");

class SubscriptionService {
  /**
   * Create a new subscription for a company (atomic + outbox-safe)
   */
  static async create(data, actorId = "system") {
    const { company_id, tier, amount, currency, payment_reference } = data;

    const company = await Company.findCompanyById(company_id);
    if (!company) throw new Error("Company not found");

    const existing = await Subscription.findByCompany(company_id);
    if (existing) throw new Error("Subscription already exists");

    // Transactional write (Subscription + Company update + Outbox)
    return await db.transaction(async (trx) => {
      const subscription = await Subscription.create(
        { company_id, tier, amount, currency, payment_reference },
        trx
      );

      await Company.changeTier(company_id, tier, actorId, trx);

      // Record outbox event
      await Outbox.create(
        {
          type: "subscription.created",
          exchange: "events_topic",
          routingKey: "subscription.created",
          payload: {
            companyId: company_id,
            tier,
            amount,
            currency,
            createdAt: new Date().toISOString(),
            traceId: uuidv4(),
          },
        },
        trx
      );

      return subscription;
    });
  }

  /**
   * Renew an existing subscription (atomic + outbox-safe)
   */
  static async renew(
    companyId,
    tier,
    amount,
    durationDays,
    currency,
    actorId = "system"
  ) {
    const subscription = await Subscription.findByCompany(companyId);
    if (!subscription) throw new Error("Subscription not found");

    return await db.transaction(async (trx) => {
      const renewed = await Subscription.renew(
        companyId,
        tier,
        amount,
        durationDays,
        trx
      );
      await Company.changeTier(companyId, tier, actorId, trx);

      await Outbox.create(
        {
          type: "subscription.renewed",
          exchange: "events_topic",
          routingKey: "subscription.renewed",
          payload: {
            companyId,
            tier,
            amount,
            currency,
            renewedAt: new Date().toISOString(),
            traceId: uuidv4(),
          },
        },
        trx
      );

      return renewed;
    });
  }

  /**
   * Deactivate a company's subscription (atomic + outbox-safe)
   */
  static async deactivate(companyId, actorId = "system") {
    const subscription = await Subscription.findByCompany(companyId);
    if (!subscription) throw new Error("Subscription not found");

    return await db.transaction(async (trx) => {
      const deactivated = await Subscription.deactivate(companyId, trx);
      await Company.changeCompanyStatus(companyId, "suspended", actorId, trx);

      await Outbox.create(
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

      return deactivated;
    });
  }
}

module.exports = SubscriptionService;
