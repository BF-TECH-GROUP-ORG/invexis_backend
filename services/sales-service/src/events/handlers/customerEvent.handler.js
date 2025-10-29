"use strict";

const { Sale } = require("../../models/index.model");

/**
 * Handles customer-related events from shop-service
 * Updates customer information in sales records and tracks customer lifecycle
 * @param {Object} event - The customer event
 */
module.exports = async function handleCustomerEvent(event) {
  try {
    const { type, data } = event;

    console.log(`👤 Processing customer event: ${type}`, data);

    switch (type) {
      case "customer.created":
        await handleCustomerCreated(data);
        break;

      case "customer.updated":
        await handleCustomerUpdated(data);
        break;

      case "customer.deleted":
        await handleCustomerDeleted(data);
        break;

      case "customer.status.changed":
        await handleCustomerStatusChanged(data);
        break;

      case "customer.address.updated":
        await handleCustomerAddressUpdated(data);
        break;

      case "customer.contact.updated":
        await handleCustomerContactUpdated(data);
        break;

      default:
        console.log(`⚠️ Unhandled customer event type: ${type}`);
    }
  } catch (error) {
    console.error(`❌ Error handling customer event: ${error.message}`);
    throw error;
  }
};

/**
 * Handle customer creation - log for audit
 */
async function handleCustomerCreated(data) {
  const { customerId, customerName } = data;

  if (!customerId) {
    console.warn("⚠️ Customer created event missing customerId");
    return;
  }

  try {
    console.log(`👤 New customer created: ${customerId} - ${customerName}`);
    console.log(`✅ Customer creation recorded`);
  } catch (error) {
    console.error(`❌ Error handling customer creation:`, error.message);
    throw error;
  }
}

/**
 * Handle customer update - update sales records
 */
async function handleCustomerUpdated(data) {
  const { customerId, customerName, customerPhone } = data;

  if (!customerId) {
    console.warn("⚠️ Customer updated event missing customerId");
    return;
  }

  try {
    // Update customer info in sales records
    const [updated] = await Sale.update(
      {
        customerName,
        customerPhone,
      },
      { where: { customerId } }
    );

    if (updated) {
      console.log(
        `✅ Updated customer ${customerId} info in ${updated} sales records`
      );
    }
  } catch (error) {
    console.error(`❌ Error updating customer ${customerId}:`, error.message);
    throw error;
  }
}

/**
 * Handle customer deletion - preserve historical data
 */
async function handleCustomerDeleted(data) {
  const { customerId } = data;

  if (!customerId) {
    console.warn("⚠️ Customer deleted event missing customerId");
    return;
  }

  try {
    console.log(`👤 Customer ${customerId} has been deleted`);

    // Find all sales for this customer
    const customerSales = await Sale.findAll({
      where: { customerId },
      attributes: ["saleId", "status"],
    });

    console.log(
      `📝 Historical sales for customer ${customerId} retained (${customerSales.length} sales)`
    );
  } catch (error) {
    console.error(`❌ Error handling customer deletion:`, error.message);
    throw error;
  }
}

/**
 * Handle customer status change
 */
async function handleCustomerStatusChanged(data) {
  const { customerId, oldStatus, newStatus } = data;

  if (!customerId) {
    console.warn("⚠️ Customer status changed event missing customerId");
    return;
  }

  try {
    console.log(
      `👤 Customer ${customerId} status: ${oldStatus} → ${newStatus}`
    );

    if (newStatus === "blocked" || newStatus === "suspended") {
      console.warn(`⚠️ Customer ${customerId} is now ${newStatus}`);

      // Find pending sales for this customer
      const pendingSales = await Sale.findAll({
        where: { customerId, status: "initiated" },
        attributes: ["saleId"],
      });

      if (pendingSales.length > 0) {
        console.warn(
          `⚠️ ${pendingSales.length} pending sales for ${newStatus} customer`
        );
      }
    } else if (newStatus === "active") {
      console.log(`✅ Customer ${customerId} is now ACTIVE`);
    }

    console.log(`✅ Customer status change recorded`);
  } catch (error) {
    console.error(`❌ Error handling customer status change:`, error.message);
    throw error;
  }
}

/**
 * Handle customer address update
 */
async function handleCustomerAddressUpdated(data) {
  const { customerId, newAddress } = data;

  if (!customerId) {
    console.warn("⚠️ Customer address updated event missing customerId");
    return;
  }

  try {
    console.log(`📍 Customer ${customerId} address updated`);

    // Update address in sales records if needed
    if (newAddress) {
      const [updated] = await Sale.update(
        { customerAddress: newAddress },
        { where: { customerId } }
      );

      if (updated) {
        console.log(
          `✅ Updated address for customer ${customerId} in ${updated} sales records`
        );
      }
    }
  } catch (error) {
    console.error(`❌ Error handling customer address update:`, error.message);
    throw error;
  }
}

/**
 * Handle customer contact update
 */
async function handleCustomerContactUpdated(data) {
  const { customerId, customerPhone } = data;

  if (!customerId) {
    console.warn("⚠️ Customer contact updated event missing customerId");
    return;
  }

  try {
    console.log(`📞 Customer ${customerId} contact updated`);

    // Update contact info in sales records
    const [updated] = await Sale.update(
      { customerPhone },
      { where: { customerId } }
    );

    if (updated) {
      console.log(
        `✅ Updated contact for customer ${customerId} in ${updated} sales records`
      );
    }
  } catch (error) {
    console.error(`❌ Error handling customer contact update:`, error.message);
    throw error;
  }
}
