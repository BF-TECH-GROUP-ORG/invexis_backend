"use strict";

const SalesItem = require("../../models/SalesItem.model");

/**
 * Handles inventory-related events from inventory-service
 * @param {Object} event - The inventory event
 */
module.exports = async function handleInventoryEvent(event) {
  try {
    switch (event.type) {
      case "product.updated":
      case "inventory.product.updated":
        console.log(`📦 Product updated: ${JSON.stringify(event.data)}`);
        // Update product information in pending sales items if needed
        if (event.data.productId) {
          const { productId, productName, price } = event.data;
          
          // Log for tracking - actual update logic depends on business rules
          console.log(
            `📝 Product ${productId} updated - Name: ${productName}, Price: ${price}`
          );
          
          // TODO: Decide if we should update pending sales items with new product info
          // This depends on business rules - usually we keep historical data as-is
        }
        break;

      case "product.stock.changed":
      case "inventory.stock.updated":
        console.log(`📊 Stock changed: ${JSON.stringify(event.data)}`);
        // Track stock changes for inventory management
        if (event.data.productId) {
          const { productId, newStock, oldStock } = event.data;
          console.log(
            `📊 Product ${productId} stock: ${oldStock} → ${newStock}`
          );
          
          // TODO: Alert if stock is low and affects pending sales
          if (newStock < 10) {
            console.warn(`⚠️ Low stock alert for product ${productId}`);
          }
        }
        break;

      case "product.out_of_stock":
      case "inventory.out_of_stock":
        console.log(`🚫 Product out of stock: ${JSON.stringify(event.data)}`);
        // Handle out of stock scenarios
        if (event.data.productId) {
          console.warn(
            `🚫 Product ${event.data.productId} is out of stock`
          );
          
          // TODO: Notify sales team or cancel pending orders
        }
        break;

      case "product.deleted":
      case "inventory.product.deleted":
        console.log(`🗑️ Product deleted: ${JSON.stringify(event.data)}`);
        // Handle product deletion
        if (event.data.productId) {
          console.log(
            `🗑️ Product ${event.data.productId} has been deleted`
          );
          
          // TODO: Mark product as discontinued in historical sales data
        }
        break;

      case "product.price.changed":
      case "inventory.price.updated":
        console.log(`💲 Price changed: ${JSON.stringify(event.data)}`);
        // Track price changes
        if (event.data.productId) {
          const { productId, oldPrice, newPrice } = event.data;
          console.log(
            `💲 Product ${productId} price: ${oldPrice} → ${newPrice}`
          );
          
          // Note: We typically don't update prices in completed sales
          // Historical data should remain unchanged
        }
        break;

      default:
        console.log(`⚠️ Unhandled inventory event type: ${event.type}`);
    }
  } catch (error) {
    console.error(`❌ Error handling inventory event: ${error.message}`);
    throw error;
  }
};

