"use strict";

const Sale = require("../../models/Sales.model");

/**
 * Handles payment-related events from payment-service
 * @param {Object} event - The payment event
 */
module.exports = async function handlePaymentEvent(event) {
  try {
    switch (event.type) {
      case "payment.completed":
      case "payment.success":
        console.log(`💰 Payment completed: ${JSON.stringify(event.data)}`);
        // Update sale payment status to 'paid'
        if (event.data.saleId) {
          await Sale.update(
            {
              paymentStatus: "paid",
              paymentId: event.data.paymentId,
              status: "completed",
            },
            {
              where: { saleId: event.data.saleId },
            }
          );
          console.log(`✅ Sale ${event.data.saleId} marked as paid`);
        }
        break;

      case "payment.failed":
        console.log(`❌ Payment failed: ${JSON.stringify(event.data)}`);
        // Update sale payment status to 'failed'
        if (event.data.saleId) {
          await Sale.update(
            {
              paymentStatus: "failed",
              status: "canceled",
            },
            {
              where: { saleId: event.data.saleId },
            }
          );
          console.log(`❌ Sale ${event.data.saleId} marked as failed`);
        }
        break;

      case "payment.refunded":
      case "refund.completed":
        console.log(`💸 Payment refunded: ${JSON.stringify(event.data)}`);
        // Update sale payment status to 'refunded'
        if (event.data.saleId) {
          await Sale.update(
            {
              paymentStatus: "refunded",
            },
            {
              where: { saleId: event.data.saleId },
            }
          );
          console.log(`💸 Sale ${event.data.saleId} marked as refunded`);
        }
        break;

      case "payment.pending":
        console.log(`⏳ Payment pending: ${JSON.stringify(event.data)}`);
        // Update sale payment status to 'pending'
        if (event.data.saleId) {
          await Sale.update(
            {
              paymentStatus: "pending",
              paymentId: event.data.paymentId,
            },
            {
              where: { saleId: event.data.saleId },
            }
          );
          console.log(`⏳ Sale ${event.data.saleId} payment pending`);
        }
        break;

      default:
        console.log(`⚠️ Unhandled payment event type: ${event.type}`);
    }
  } catch (error) {
    console.error(`❌ Error handling payment event: ${error.message}`);
    throw error;
  }
};
