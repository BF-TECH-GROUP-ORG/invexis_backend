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

  console.log(`\n${'='.repeat(80)}`);
  console.log(`✅ [SALES] Received inventory.return.confirmed event`);
  console.log(`${'='.repeat(80)}`);
  console.log(`Return ID: ${returnId}`);
  console.log(`Sale ID: ${saleId}`);
  console.log(`Company ID: ${companyId}`);
  console.log(`Confirmed Items:`, JSON.stringify(confirmedItems, null, 2));
  console.log(`${'='.repeat(80)}\n`);

  if (!returnId || !saleId) {
    console.warn("⚠️ Return confirmed event missing returnId or saleId");
    return;
  }

  try {
    console.log(`🔄 Updating return ${returnId} status to fully_returned...`);

    // Update return status to fully_returned
    const [updated] = await SalesReturn.update(
      {
        status: "fully_returned",
        confirmedAt: new Date(),
      },
      { where: { returnId, saleId } }
    );

    if (updated) {
      console.log(`✅ Sales return ${returnId} marked as fully_returned`);

      // Update sale status to reflect full return
      console.log(`🔄 Updating sale ${saleId} payment status to refunded...`);
      await Sale.update(
        { paymentStatus: "refunded" },
        { where: { saleId } }
      );
      console.log(`✅ Sale ${saleId} payment status updated to refunded`);

      // Log confirmed items for audit trail
      if (confirmedItems.length > 0) {
        console.log(
          `📋 Confirmed items: ${confirmedItems.map((i) => `${i.productId} (${i.oldQuantity} → ${i.newQuantity})`).join(", ")}`
        );
      }

      console.log(`\n✅ [SALES] Return confirmation completed successfully\n`);
    } else {
      console.warn(`⚠️ No return record updated for returnId ${returnId}, saleId ${saleId}`);
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
      { where: { returnId, saleId } }
    );

    if (updated) {
      console.log(`⚠️ Sales return ${returnId} marked as rejected`);

      // Check if there are other non-rejected returns for this sale
      const otherReturns = await SalesReturn.count({
        where: {
          saleId,
          returnId: { [require('sequelize').Op.ne]: returnId },
          status: { [require('sequelize').Op.notIn]: ['rejected'] }
        }
      });

      // Only revert payment status and isReturned flag if no other active returns exist
      if (otherReturns === 0) {
        await Sale.update(
          {
            paymentStatus: "paid",
            isReturned: false
          },
          { where: { saleId } }
        );
        console.log(`⚠️ Sale ${saleId} payment status reverted to paid and isReturned set to false (no other active returns)`);
      } else {
        console.log(`ℹ️ Sale ${saleId} still has ${otherReturns} other active return(s), keeping isReturned as true`);
      }
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
      { where: { returnId, saleId } }
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

