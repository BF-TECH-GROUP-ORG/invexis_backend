"use strict";

const { Sale, Invoice } = require("../../models/index.model");
const { processEventOnce } = require("../../utils/eventDeduplication");

/**
 * Handles payment-related events from payment-service
 * Updates sale and invoice status based on payment events
 * @param {Object} event - The payment event
 */
module.exports = async function handlePaymentEvent(event) {
  try {
    const { type, data } = event;

    console.log(`💳 Processing payment event: ${type}`, data);

    // Generate event ID for deduplication
    const traceId = data.traceId || data.trace_id;
    const fallbackId = data.paymentId || data.saleId || '';
    const eventId = traceId || `${type}:${fallbackId}:${Date.now()}`;

    // Process event with automatic deduplication
    const result = await processEventOnce(
      eventId,
      type,
      async () => {
        switch (type) {
          case "payment.completed":
          case "payment.success":
          case "payment.succeeded":
            await handlePaymentSuccess(data);
            break;

          case "payment.failed":
            await handlePaymentFailed(data);
            break;

          case "payment.refunded":
          case "refund.completed":
            await handlePaymentRefunded(data);
            break;

          case "payment.processed":
          case "payment.pending":
            await handlePaymentPending(data);
            break;

          case "payment.cancelled":
            await handlePaymentCancelled(data);
            break;

          default:
            console.log(`⚠️ Unhandled payment event type: ${type}`);
        }
      },
      { eventType: type, timestamp: new Date(), saleId: data.saleId }
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
 */
async function handlePaymentSuccess(data) {
  // Extract saleId from root or metadata
  const saleId = data.saleId || data.metadata?.saleId;
  const paymentId = data.paymentId;
  const amount = data.amount;

  if (!saleId) {
    console.warn("⚠️ Payment success event missing saleId");
    return;
  }

  try {
    // Update sale payment status
    const [updated] = await Sale.update(
      {
        paymentStatus: "paid",
        paymentId,
        status: "completed",
      },
      { where: { saleId } }
    );

    if (updated) {
      console.log(`✅ Sale ${saleId} marked as paid (Payment: ${paymentId})`);

      // Update associated invoice if exists
      await Invoice.update({ status: "paid" }, { where: { saleId } });
      console.log(`✅ Invoice for sale ${saleId} marked as paid`);
    } else {
      console.warn(`⚠️ No sale found with saleId: ${saleId}`);
    }
  } catch (error) {
    console.error(`❌ Error updating sale ${saleId} to paid:`, error.message);
    throw error;
  }
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(data) {
  // Extract saleId from root or metadata
  const saleId = data.saleId || data.metadata?.saleId;
  const paymentId = data.paymentId;
  const reason = data.reason || data.failureReason;

  if (!saleId) {
    console.warn("⚠️ Payment failed event missing saleId");
    return;
  }

  try {
    const [updated] = await Sale.update(
      {
        paymentStatus: "failed",
        status: "canceled",
      },
      { where: { saleId } }
    );

    if (updated) {
      console.log(`❌ Sale ${saleId} marked as failed (Reason: ${reason})`);
    } else {
      console.warn(`⚠️ No sale found with saleId: ${saleId}`);
    }
  } catch (error) {
    console.error(`❌ Error updating sale ${saleId} to failed:`, error.message);
    throw error;
  }
}

/**
 * Handle refunded payment
 */
async function handlePaymentRefunded(data) {
  const { saleId, refundAmount, refundId } = data;

  if (!saleId) {
    console.warn("⚠️ Payment refunded event missing saleId");
    return;
  }

  try {
    const [updated] = await Sale.update(
      {
        paymentStatus: "refunded",
      },
      { where: { saleId } }
    );

    if (updated) {
      console.log(
        `💸 Sale ${saleId} marked as refunded (Amount: ${refundAmount}, Refund ID: ${refundId})`
      );
    }
  } catch (error) {
    console.error(
      `❌ Error updating sale ${saleId} to refunded:`,
      error.message
    );
    throw error;
  }
}

/**
 * Handle pending payment
 */
async function handlePaymentPending(data) {
  // Extract saleId from root or metadata
  const saleId = data.saleId || data.metadata?.saleId;
  const paymentId = data.paymentId;

  if (!saleId) {
    console.warn("⚠️ Payment pending event missing saleId");
    return;
  }

  try {
    const [updated] = await Sale.update(
      {
        paymentStatus: "pending",
        paymentId,
      },
      { where: { saleId } }
    );

    if (updated) {
      console.log(
        `⏳ Sale ${saleId} payment pending (Payment ID: ${paymentId})`
      );
    }
  } catch (error) {
    console.error(
      `❌ Error updating sale ${saleId} to pending:`,
      error.message
    );
    throw error;
  }
}

/**
 * Handle cancelled payment
 */
async function handlePaymentCancelled(data) {
  const { saleId, reason } = data;

  if (!saleId) {
    console.warn("⚠️ Payment cancelled event missing saleId");
    return;
  }

  try {
    const [updated] = await Sale.update(
      {
        paymentStatus: "cancelled",
        status: "canceled",
      },
      { where: { saleId } }
    );

    if (updated) {
      console.log(`🚫 Sale ${saleId} payment cancelled (Reason: ${reason})`);
    }
  } catch (error) {
    console.error(
      `❌ Error updating sale ${saleId} to cancelled:`,
      error.message
    );
    throw error;
  }
}
