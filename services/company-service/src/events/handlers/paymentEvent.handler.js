"use strict";

const { Subscription } = require("../../models/subscription.model");
const { Company } = require("../../models/company.model");
const { processEventOnce } = require("../../utils/eventDeduplication");

/**
 * Handles payment and subscription events from payment-service
 * Manages subscription activation, renewal, and expiration
 * @param {Object} event - The payment event
 */
module.exports = async function handlePaymentEvent(event) {
  try {
    const { type, data } = event;

    console.log(`💳 Processing payment event: ${type}`, data);

    // Generate event ID for deduplication
    const traceId = data.traceId || data.trace_id;
    const fallbackId = data.paymentId || data.subscriptionId || '';
    const eventId = traceId || `${type}:${fallbackId}:${Date.now()}`;

    // Process event with automatic deduplication
    const result = await processEventOnce(
      eventId,
      type,
      async () => {
        switch (type) {
          case "payment.subscription.success":
          case "payment.completed":
            await handlePaymentSuccess(data);
            break;

          case "payment.subscription.failed":
          case "payment.failed":
            await handlePaymentFailed(data);
            break;

          case "subscription.expired":
            await handleSubscriptionExpired(data);
            break;

          case "subscription.renewed":
            await handleSubscriptionRenewed(data);
            break;

          default:
            console.log(`⚠️ Unhandled payment event type: ${type}`);
        }
      },
      { eventType: type, timestamp: new Date(), subscriptionId: data.subscriptionId }
    );

    if (result.duplicate) {
      console.log(`🔄 Skipped duplicate payment event: ${type}`, { eventId });
    }
  } catch (error) {
    console.error(`❌ Error handling payment event: ${error.message}`);
    throw error;
  }
};

/**
 * Handle successful payment
 * Activate or extend company subscription
 */
async function handlePaymentSuccess(data) {
  const { companyId, subscriptionId, paymentId } = data;

  if (!companyId || !subscriptionId) {
    console.warn(
      "⚠️ Payment success event missing companyId or subscriptionId"
    );
    return;
  }

  try {
    console.log(`💰 Payment success for company ${companyId}`);

    // Update subscription status to active
    const [updated] = await Subscription.update(
      {
        status: "active",
        paymentStatus: "paid",
        paymentId,
        lastPaymentAt: new Date(),
      },
      { where: { subscriptionId, companyId } }
    );

    if (updated) {
      console.log(
        `✅ Subscription ${subscriptionId} activated for company ${companyId}`
      );

      // Update company status if needed
      const company = await Company.findByPk(companyId);
      if (company && company.status !== "active") {
        await company.update({ status: "active" });
        console.log(`✅ Company ${companyId} status updated to active`);
      }
    }
  } catch (error) {
    console.error(
      `❌ Error handling payment success for company ${companyId}:`,
      error.message
    );
    throw error;
  }
}

/**
 * Handle failed payment
 * Send alert to company admin and mark subscription as failed
 */
async function handlePaymentFailed(data) {
  const { companyId, subscriptionId, reason, paymentId } = data;

  if (!companyId || !subscriptionId) {
    console.warn("⚠️ Payment failed event missing companyId or subscriptionId");
    return;
  }

  try {
    console.log(`❌ Payment failed for company ${companyId}: ${reason}`);

    // Update subscription status to failed
    const [updated] = await Subscription.update(
      {
        paymentStatus: "failed",
        paymentId,
        lastPaymentFailedAt: new Date(),
        failureReason: reason,
      },
      { where: { subscriptionId, companyId } }
    );

    if (updated) {
      console.log(`⚠️ Subscription ${subscriptionId} payment marked as failed`);

      // TODO: Send notification to company admin
      // This would integrate with notification-service
      console.log(`📧 Alert: Payment failed for company ${companyId}`);
    }
  } catch (error) {
    console.error(
      `❌ Error handling payment failure for company ${companyId}:`,
      error.message
    );
    throw error;
  }
}

/**
 * Handle subscription expiration
 * Downgrade service tier or deactivate company
 */
async function handleSubscriptionExpired(data) {
  const { companyId, subscriptionId } = data;

  if (!companyId || !subscriptionId) {
    console.warn(
      "⚠️ Subscription expired event missing companyId or subscriptionId"
    );
    return;
  }

  try {
    console.log(`⌛ Subscription expired for company ${companyId}`);

    // Update subscription status to expired
    const [updated] = await Subscription.update(
      {
        status: "expired",
        expiredAt: new Date(),
      },
      { where: { subscriptionId, companyId } }
    );

    if (updated) {
      console.log(`✅ Subscription ${subscriptionId} marked as expired`);

      // Downgrade company to free tier or suspend
      const company = await Company.findByPk(companyId);
      if (company) {
        await company.update({
          tier: "free",
          status: "suspended",
        });
        console.log(
          `⚠️ Company ${companyId} downgraded to free tier and suspended`
        );
      }
    }
  } catch (error) {
    console.error(
      `❌ Error handling subscription expiration for company ${companyId}:`,
      error.message
    );
    throw error;
  }
}

/**
 * Handle subscription renewal
 * Extend subscription period
 */
async function handleSubscriptionRenewed(data) {
  const { companyId, subscriptionId, nextBillingDate } = data;

  if (!companyId || !subscriptionId) {
    console.warn(
      "⚠️ Subscription renewed event missing companyId or subscriptionId"
    );
    return;
  }

  try {
    console.log(`🔄 Subscription renewed for company ${companyId}`);

    // Update subscription with new dates
    const [updated] = await Subscription.update(
      {
        status: "active",
        renewedAt: new Date(),
        nextBillingDate:
          nextBillingDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      { where: { subscriptionId, companyId } }
    );

    if (updated) {
      console.log(
        `✅ Subscription ${subscriptionId} renewed for company ${companyId}`
      );

      // Ensure company is active
      const company = await Company.findByPk(companyId);
      if (company && company.status !== "active") {
        await company.update({ status: "active" });
        console.log(`✅ Company ${companyId} reactivated`);
      }
    }
  } catch (error) {
    console.error(
      `❌ Error handling subscription renewal for company ${companyId}:`,
      error.message
    );
    throw error;
  }
}
