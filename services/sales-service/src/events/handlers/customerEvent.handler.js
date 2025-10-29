"use strict";

const Sale = require("../../models/Sales.model");

/**
 * Handles customer-related events from shop-service
 * @param {Object} event - The customer event
 */
module.exports = async function handleCustomerEvent(event) {
  try {
    switch (event.type) {
      case "customer.created":
        console.log(`👤 Customer created: ${JSON.stringify(event.data)}`);
        // Track new customer creation
        if (event.data.customerId) {
          console.log(
            `👤 New customer ${event.data.customerId} - ${event.data.customerName}`
          );
          
          // TODO: Initialize customer purchase history
        }
        break;

      case "customer.updated":
        console.log(`👤 Customer updated: ${JSON.stringify(event.data)}`);
        // Update customer information in sales records
        if (event.data.customerId) {
          const { customerId, customerName, customerPhone, customerEmail } =
            event.data;

          // Update customer info in sales where customer is referenced
          await Sale.update(
            {
              customerName: customerName,
              customerPhone: customerPhone,
            },
            {
              where: { customerId: customerId },
            }
          );

          console.log(
            `✅ Updated customer ${customerId} info in sales records`
          );
        }
        break;

      case "customer.deleted":
        console.log(`👤 Customer deleted: ${JSON.stringify(event.data)}`);
        // Handle customer deletion
        if (event.data.customerId) {
          console.log(`👤 Customer ${event.data.customerId} has been deleted`);
          
          // Note: We typically keep historical sales data
          // Just log for audit purposes
          console.log(
            `📝 Historical sales for customer ${event.data.customerId} retained`
          );
        }
        break;

      case "customer.status.changed":
        console.log(
          `👤 Customer status changed: ${JSON.stringify(event.data)}`
        );
        // Handle customer status changes
        if (event.data.customerId) {
          const { customerId, oldStatus, newStatus } = event.data;
          console.log(
            `👤 Customer ${customerId} status: ${oldStatus} → ${newStatus}`
          );
          
          // TODO: Handle blocked/suspended customers
          if (newStatus === "blocked" || newStatus === "suspended") {
            console.warn(`⚠️ Customer ${customerId} is ${newStatus}`);
            // TODO: Prevent new sales for this customer
          }
        }
        break;

      case "customer.address.updated":
        console.log(
          `📍 Customer address updated: ${JSON.stringify(event.data)}`
        );
        // Track address updates
        if (event.data.customerId) {
          const { customerId, newAddress } = event.data;
          console.log(`📍 Customer ${customerId} address updated`);
          
          // TODO: Update default delivery address for future orders
        }
        break;

      case "customer.contact.updated":
        console.log(
          `📞 Customer contact updated: ${JSON.stringify(event.data)}`
        );
        // Track contact updates
        if (event.data.customerId) {
          const { customerId, customerPhone, customerEmail } = event.data;

          // Update contact info in sales records
          await Sale.update(
            {
              customerPhone: customerPhone,
            },
            {
              where: { customerId: customerId },
            }
          );

          console.log(
            `✅ Updated customer ${customerId} contact in sales records`
          );
        }
        break;

      default:
        console.log(`⚠️ Unhandled customer event type: ${event.type}`);
    }
  } catch (error) {
    console.error(`❌ Error handling customer event: ${error.message}`);
    throw error;
  }
};

