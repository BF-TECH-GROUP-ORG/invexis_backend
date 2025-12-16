"use strict";

const { SalesReturn, Sale } = require("../../models/index.model");
const { returnEvents } = require("../eventHelpers");

/**
 * Handles inventory return confirmation events from inventory-service
 * Updates sales return status to fully_returned when inventory confirms items are received
 * @param {Object} event - The inventory return event
 */
module.exports = async function handleInventoryReturnEvent(event) {
  try {
    const { type, data } = event;

    console.log(`📦 Processing inventory return event: ${type}`, data);

    switch (type) {
      case "inventory.return.confirmed":
      case "inventory.return.received":
        await handleReturnConfirmed(data);
        break;

      case "inventory.return.rejected":
      case "inventory.return.failed":
        await handleReturnRejected(data);
        break;

      case "inventory.return.partially_received":
        await handleReturnPartiallyReceived(data);
        break;

      default:
        console.log(`⚠️ Unhandled inventory return event type: ${type}`);
    }
  } catch (error) {
    console.error(`❌ Error handling inventory return event: ${error.message}`);
    throw error;
  }
};

/**
 * Handle inventory confirmation of return
 * Update sales return status to fully_returned
 */
async function handleReturnConfirmed(data) {
  const { returnId, saleId, companyId, confirmedItems = [] } = data;

  if (!returnId || !saleId) {
    console.warn("⚠️ Return confirmed event missing returnId or saleId");
    return;
  }

  try {
    console.log(`✅ Inventory confirmed return ${returnId} for sale ${saleId}`);

    // Update return status to fully_returned
    const [updated] = await SalesReturn.update(
      {
        status: "fully_returned",
        confirmedAt: new Date(),
      },
      { where: { id: returnId, saleId } }
    );

    if (updated) {
      console.log(`✅ Sales return ${returnId} marked as fully_returned`);

      // Update sale status to reflect full return
      await Sale.update(
        { paymentStatus: "refunded" },
        { where: { saleId } }
      );
      console.log(`✅ Sale ${saleId} payment status updated to refunded`);

      // Log confirmed items for audit trail
      if (confirmedItems.length > 0) {
        console.log(
          `📋 Confirmed items: ${confirmedItems.map((i) => `${i.productId}(qty:${i.quantity})`).join(", ")}`
        );
      }
    }
  } catch (error) {
    console.error(
      `❌ Error handling return confirmation for return ${returnId}:`,
      error.message
    );
    throw error;
  }
}

/**
 * Handle inventory rejection of return
 * Update sales return status to rejected
 */
async function handleReturnRejected(data) {
  const { returnId, saleId, reason = "" } = data;

  if (!returnId || !saleId) {
    console.warn("⚠️ Return rejected event missing returnId or saleId");
    return;
  }

  try {
    console.log(`❌ Inventory rejected return ${returnId}: ${reason}`);

    // Update return status to rejected
    const [updated] = await SalesReturn.update(
      {
        status: "rejected",
        rejectionReason: reason,
        rejectedAt: new Date(),
      },
      { where: { id: returnId, saleId } }
    );

    if (updated) {
      console.log(`⚠️ Sales return ${returnId} marked as rejected`);

      // Revert sale payment status back to paid (no refund)
      await Sale.update(
        { paymentStatus: "paid" },
        { where: { saleId } }
      );
      console.log(`⚠️ Sale ${saleId} payment status reverted to paid (no refund)`);
    }
  } catch (error) {
    console.error(
      `❌ Error handling return rejection for return ${returnId}:`,
      error.message
    );
    throw error;
  }
}

/**
 * Handle partial return confirmation
 * Update sales return status to partially_returned
 */
async function handleReturnPartiallyReceived(data) {
  const { returnId, saleId, receivedItems = [], rejectedItems = [] } = data;

  if (!returnId || !saleId) {
    console.warn("⚠️ Partial return event missing returnId or saleId");
    return;
  }

  try {
    console.log(
      `⚠️ Inventory partially received return ${returnId} for sale ${saleId}`
    );

    // Update return status to partially_returned
    const [updated] = await SalesReturn.update(
      {
        status: "partially_returned",
        receivedItemsCount: receivedItems.length,
        rejectedItemsCount: rejectedItems.length,
        partiallyReceivedAt: new Date(),
      },
      { where: { id: returnId, saleId } }
    );

    if (updated) {
      console.log(
        `⚠️ Sales return ${returnId} marked as partially_returned (${receivedItems.length} received, ${rejectedItems.length} rejected)`
      );

      // Log received and rejected items
      if (receivedItems.length > 0) {
        console.log(
          `✅ Received: ${receivedItems.map((i) => `${i.productId}(qty:${i.quantity})`).join(", ")}`
        );
      }
      if (rejectedItems.length > 0) {
        console.log(
          `❌ Rejected: ${rejectedItems.map((i) => `${i.productId}(qty:${i.quantity})`).join(", ")}`
        );
      }
    }
  } catch (error) {
    console.error(
      `❌ Error handling partial return for return ${returnId}:`,
      error.message
    );
    throw error;
  }
}

