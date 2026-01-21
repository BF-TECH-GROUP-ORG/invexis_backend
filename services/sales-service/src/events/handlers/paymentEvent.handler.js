"use strict";

const { Sale } = require("../../models/index.model");
const { processEventOnce } = require("../../utils/eventDeduplication");

/**
 * Handles payment-related events from payment-service
 * Updates sale and invoice status based on payment events
 * @param {Object} event - The payment event
 */
module.exports = async function handlePaymentEvent(event) {
  try {
    // Standardize event structure: Support both wrapped {type, data} and direct formats
    let type = event.type || event.event;
    let data = event.data;

    // If it's a direct format (no data wrapper), use the event itself as data
    if (!data && type) {
      data = event;
    }

    // Still no data? Skip.
    if (!data) {
      console.log(`⚠️ Received invalid event, skipping`, event);
      return;
    }

    console.log(`💳 Processing payment event: ${type}`, data);

    // Generate event ID for deduplication
    const traceId = data.traceId || data.trace_id;
    const fallbackId = data.saleId || data.context?.saleId || data.paymentId || '';
    const eventId = traceId || `${type}:${fallbackId}`;

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

          case "document.invoice.created":
            await handleInvoiceCreated(data);
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
  // Extract saleId from root, metadata or order_id
  const saleId = data.saleId || data.metadata?.saleId || data.order_id;
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
  // Extract saleId from root, metadata or order_id
  const saleId = data.saleId || data.metadata?.saleId || data.order_id;
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
  const saleId = data.saleId || data.metadata?.saleId || data.order_id;
  const { refundAmount, refundId } = data;

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
  // Extract saleId from root, metadata or order_id
  const saleId = data.saleId || data.metadata?.saleId || data.order_id;
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
  const saleId = data.saleId || data.metadata?.saleId || data.order_id;
  const { reason } = data;

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

/**
 * Handle document completion event
 */
async function handleInvoiceCreated(data) {
  const { url, context } = data;
  const saleId = context?.saleId || data.saleId;

  if (!saleId || !url) {
    console.warn("⚠️ Document completion event missing saleId or URL");
    return;
  }

  try {
    const [updated] = await Sale.update(
      { invoiceUrl: url },
      { where: { saleId } }
    );

    if (updated) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📄 ✅ INVOICE PDF GENERATED SUCCESSFULLY`);
      console.log(`   Sale ID: ${saleId}`);
      console.log(`   Invoice URL: ${url}`);
      console.log(`${'='.repeat(80)}\n`);
    }
  } catch (error) {
    console.error(`❌ Error linking invoice to sale ${saleId}:`, error.message);
    throw error;
  }
}
