"use strict";

const Subscription = require("../../models/subscription.model");
const Company = require("../../models/company.model");
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
    const fallbackId = data.paymentId || data.subscriptionId || data.payment_id || '';
    const eventId = traceId || `${type}:${fallbackId}:${Date.now()}`;

    // Process event with automatic deduplication
    const result = await processEventOnce(
      eventId,
      type,
      async () => {
        switch (type) {
          case "payment.processed":
          case "payment.succeeded":
          case "payment.completed":
          case "subscription.payment.succeeded":
            await handlePaymentSuccess(data);
            break;

          case "payment.failed":
          case "subscription.payment.failed":
            await handlePaymentFailed(data);
            break;

          case "subscription.expired":
            await handleSubscriptionExpired(data);
            break;

          default:
            console.log(`⚠️ Unhandled payment event type: ${type}`);
        }
      },
      { eventType: type, timestamp: new Date(), companyId: data.companyId || data.company_id }
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
  // Extract companyId from root or metadata
  const companyId = data.companyId || data.company_id || data.metadata?.companyId;

  if (!companyId) {
    console.warn("⚠️ Payment success event missing companyId");
    return;
  }

  try {
    console.log(`💰 Payment success for company ${companyId}`);

    // Update subscription status to active
    const subscription = await Subscription.findByCompany(companyId);
    if (subscription) {
      await Subscription.update(companyId, {
        is_active: true,
        last_billing_status: "succeeded",
        last_billing_attempt: new Date(),
        updatedAt: new Date()
      });
      console.log(`✅ Subscription activated for company ${companyId}`);
    }

    // Update company status to active if needed
    const company = await Company.findCompanyById(companyId);
    if (company && company.status !== "active") {
      await Company.changeCompanyStatus(companyId, "active", "system");
      console.log(`✅ Company ${companyId} status updated to active`);
    }
  } catch (error) {
    console.error(`❌ Error handling payment success for company ${companyId}:`, error.message);
    throw error;
  }
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(data) {
  // Extract companyId from root or metadata
  const companyId = data.companyId || data.company_id || data.metadata?.companyId;
  const reason = data.reason || data.failure_reason || data.failureReason;

  if (!companyId) {
    console.warn("⚠️ Payment failed event missing companyId");
    return;
  }

  try {
    console.log(`❌ Payment failed for company ${companyId}: ${reason}`);

    // Update subscription billing status
    const subscription = await Subscription.findByCompany(companyId);
    if (subscription) {
      await Subscription.update(companyId, {
        last_billing_status: "failed",
        last_billing_attempt: new Date(),
        metadata: { ...subscription.metadata, last_failure_reason: reason },
        updatedAt: new Date()
      });
    }

    console.log(`📧 Alert: Payment failed for company ${companyId}`);
  } catch (error) {
    console.error(`❌ Error handling payment failure for company ${companyId}:`, error.message);
    throw error;
  }
}

/**
 * Handle subscription expiration
 */
async function handleSubscriptionExpired(data) {
  const companyId = data.companyId || data.company_id;

  if (!companyId) {
    console.warn("⚠️ Subscription expired event missing companyId");
    return;
  }

  try {
    console.log(`⌛ Subscription expired for company ${companyId}`);

    // Update subscription status
    await Subscription.update(companyId, {
      is_active: false,
      updatedAt: new Date()
    });

    // Downgrade company status
    await Company.changeCompanyStatus(companyId, "suspended", "system");
    console.log(`⚠️ Company ${companyId} suspended due to expired subscription`);
  } catch (error) {
    console.error(`❌ Error handling subscription expiration for company ${companyId}:`, error.message);
    throw error;
  }
}
