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
   * Process all subscriptions due for auto-renewal (Pivoted to Suspend & Notify for MVP)
   */
  static async processDueRenewals() {
    try {
      const due = await Subscription.getDueRenewals();
      console.log(`🔄 [SubscriptionService] Found ${due.length} subscriptions due for manual renewal check`);

      for (const sub of due) {
        console.log(`⚠️ [SubscriptionService] Subscription expired for company: ${sub.company_id}. Suspending...`);

        // Transactional write: Deactivate Subscription + Suspend Company + Notify
        await db.transaction(async (trx) => {
          // 1. Deactivate subscription
          await Subscription.update(sub.company_id, {
            is_active: false,
            last_billing_status: 'expired',
            last_billing_attempt: new Date(),
            updatedAt: new Date()
          }, trx);

          // 2. Suspend company
          await Company.changeCompanyStatus(sub.company_id, 'suspended', 'system', trx);

          // 3. Emit subscription.expired event for notifications (Email + SMS)
          const company = await Company.findCompanyById(sub.company_id);
          
          await Outbox.create({
            type: "subscription.expired",
            exchange: "events_topic",
            routingKey: "subscription.expired",
            payload: {
              companyId: sub.company_id,
              companyName: company?.name || 'Your Company',
              tier: sub.tier,
              endDate: sub.end_date,
              adminId: company?.company_admin_id,
              adminEmail: company?.email,
              adminPhone: company?.phone,
              traceId: uuidv4(),
            },
          }, trx);
        });

        console.log(`✅ [SubscriptionService] Company ${sub.company_id} suspended and expiration event emitted.`);
      }
    } catch (error) {
      console.error("❌ [SubscriptionService] Error processing expiries:", error.message);
    }
  }
}

module.exports = SubscriptionService;
