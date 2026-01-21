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
 * Handle customer update - update KnownUser records
 */
async function handleCustomerUpdated(data) {
  const { customerId, customerName, customerPhone, customerEmail } = data;

  if (!customerId && !customerPhone) {
    console.warn("⚠️ Customer updated event missing identifying info (customerId or phone)");
    return;
  }

  try {
    const { KnownUser } = require("../../models/index.model");
    const redisHelper = require("../../utils/redisHelper");
    const { Op } = require("sequelize");

    // Update KnownUser globally
    const [updated] = await KnownUser.update(
      {
        customerName,
        customerPhone,
        customerEmail,
      },
      {
        where: {
          [Op.or]: [
            customerId ? { customerId } : null,
            customerPhone ? { customerPhone } : null
          ].filter(Boolean)
        }
      }
    );

    if (updated) {
      console.log(`✅ Updated KnownUser(s) for customer ${customerId || customerPhone}`);
      await redisHelper.scanDel("known_users:*");
    }
  } catch (error) {
    console.error(`❌ Error updating KnownUser:`, error.message);
    throw error;
  }
}

/**
 * Handle customer deletion - deactive KnownUser record
 */
async function handleCustomerDeleted(data) {
  const { customerId, customerPhone } = data;

  if (!customerId && !customerPhone) {
    console.warn("⚠️ Customer deleted event missing identifying info");
    return;
  }

  try {
    const { KnownUser } = require("../../models/index.model");
    const redisHelper = require("../../utils/redisHelper");
    const { Op } = require("sequelize");

    console.log(`👤 Customer ${customerId || customerPhone} deleted - deactivating KnownUser`);

    await KnownUser.update(
      { isActive: false },
      {
        where: {
          [Op.or]: [
            customerId ? { customerId } : null,
            customerPhone ? { customerPhone } : null
          ].filter(Boolean)
        }
      }
    );

    await redisHelper.scanDel("known_users:*");
  } catch (error) {
    console.error(`❌ Error handling customer deletion:`, error.message);
    throw error;
  }
}

/**
 * Handle customer status change
 */
async function handleCustomerStatusChanged(data) {
  const { customerId, customerPhone, newStatus } = data;

  try {
    const { KnownUser } = require("../../models/index.model");
    const redisHelper = require("../../utils/redisHelper");
    const { Op } = require("sequelize");

    console.log(`👤 Customer status changed to ${newStatus}`);

    if (newStatus === "blocked" || newStatus === "suspended" || newStatus === "inactive") {
      await KnownUser.update(
        { isActive: false },
        {
          where: {
            [Op.or]: [
              customerId ? { customerId } : null,
              customerPhone ? { customerPhone } : null
            ].filter(Boolean)
          }
        }
      );
      await redisHelper.scanDel("known_users:*");
    }
  } catch (error) {
    console.error(`❌ Error handling customer status change:`, error.message);
    throw error;
  }
}

/**
 * Handle customer address update
 */
async function handleCustomerAddressUpdated(data) {
  const { customerId, customerPhone, newAddress } = data;

  try {
    const { KnownUser } = require("../../models/index.model");
    const redisHelper = require("../../utils/redisHelper");
    const { Op } = require("sequelize");

    if (newAddress) {
      const [updated] = await KnownUser.update(
        { customerAddress: newAddress },
        {
          where: {
            [Op.or]: [
              customerId ? { customerId } : null,
              customerPhone ? { customerPhone } : null
            ].filter(Boolean)
          }
        }
      );

      if (updated) {
        console.log(`✅ Updated address for customer ${customerId || customerPhone}`);
        await redisHelper.scanDel("known_users:*");
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
  const { customerId, customerPhone, newPhone } = data;

  try {
    const { KnownUser } = require("../../models/index.model");
    const redisHelper = require("../../utils/redisHelper");
    const { Op } = require("sequelize");

    const [updated] = await KnownUser.update(
      { customerPhone: newPhone || customerPhone },
      {
        where: {
          [Op.or]: [
            customerId ? { customerId } : null,
            customerPhone ? { customerPhone } : null
          ].filter(Boolean)
        }
      }
    );

    if (updated) {
      console.log(`✅ Updated contact for customer ${customerId || customerPhone}`);
      await redisHelper.scanDel("known_users:*");
    }
  } catch (error) {
    console.error(`❌ Error handling customer contact update:`, error.message);
    throw error;
  }
}
