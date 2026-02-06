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

  /**
   * Smart Subscription Guard:
   * 1. Alert 2 days before expiry
   * 2. Lock 3 days after expiry (Grace Period)
   */
  static async runSmartSubscriptionChecks() {
    try {
      console.log("🕒 [SubscriptionService] Running Smart Subscription Checks...");

      // 1. Proactive Alerts (2 days before)
      const expiringSoon = await Subscription.getExpiringSoon(2);
      for (const sub of expiringSoon) {
        await this._emitAlertEvent(sub, "subscription.expiring.soon", "Your subscription ends in 2 days. Please renew to avoid service interruption.");
      }

      // 2. Grace Period Locks (3 days after)
      const graceExpired = await Subscription.getGracePeriodExpired(3);
      for (const sub of graceExpired) {
        await this.deactivate(sub.company_id, "system_grace_period_expired");
        console.log(`🔒 [SubscriptionService] Company ${sub.company_id} locked after 3-day grace period.`);
      }

      console.log(`✅ [SubscriptionService] Smart Checks Done: Alerts(${expiringSoon.length}), Locks(${graceExpired.length})`);
    } catch (error) {
      console.error("❌ [SubscriptionService] Smart Check Error:", error.message);
    }
  }

  /**
   * Internal helper to emit alert events
   */
  static async _emitAlertEvent(sub, type, message) {
    const company = await Company.findCompanyById(sub.company_id);
    await db.transaction(async (trx) => {
      await Outbox.create({
        type,
        exchange: "events_topic",
        routingKey: type,
        payload: {
          companyId: sub.company_id,
          companyName: company?.name,
          adminEmail: company?.email,
          adminPhone: company?.phone,
          message,
          endDate: sub.end_date,
          traceId: uuidv4(),
        },
      }, trx);
    });
    console.log(`📧 [SubscriptionService] Alert (${type}) queued for company ${sub.company_id}`);
  }

  /**
   * Process all subscriptions due for auto-renewal (Pivoted to Suspend & Notify for MVP)
   */
  static async processDueRenewals() {
    // Keep this for standard expiration checks if needed, 
    // but the Smart Checks cover the specific 2-day/3-day windows.
    await this.runSmartSubscriptionChecks();
  }
}

module.exports = SubscriptionService;
