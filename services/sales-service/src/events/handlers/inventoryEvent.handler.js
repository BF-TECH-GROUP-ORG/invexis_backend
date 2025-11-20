"use strict";

const { SalesItem, Sale } = require("../../models/index.model");

/**
 * Handles inventory-related events from inventory-service
 * Tracks product updates, stock changes, and manages sales impact
 * @param {Object} event - The inventory event
 */
module.exports = async function handleInventoryEvent(event) {
  try {
    const { type, data } = event;

    console.log(`📦 Processing inventory event: ${type}`, data);

    switch (type) {
      case "product.updated":
      case "inventory.product.updated":
        await handleProductUpdated(data);
        break;

      case "product.stock.changed":
      case "inventory.stock.updated":
        await handleStockChanged(data);
        break;

      case "product.out_of_stock":
      case "inventory.out_of_stock":
        await handleOutOfStock(data);
        break;

      case "product.deleted":
      case "inventory.product.deleted":
        await handleProductDeleted(data);
        break;

      case "product.price.changed":
      case "inventory.price.updated":
        await handlePriceChanged(data);
        break;

      default:
        console.log(`⚠️ Unhandled inventory event type: ${type}`);
    }
  } catch (error) {
    console.error(`❌ Error handling inventory event: ${error.message}`);
    throw error;
  }
};

/**
 * Handle product update - log for audit trail
 */
async function handleProductUpdated(data) {
  const { productId, productName, price, description } = data;

  if (!productId) {
    console.warn("⚠️ Product updated event missing productId");
    return;
  }

  try {
    console.log(
      `📝 Product ${productId} updated - Name: ${productName}, Price: ${price}`
    );

    // Note: We keep historical sales data as-is (don't update completed sales)
    // Only log for audit purposes
    console.log(`✅ Product update recorded for audit trail`);
  } catch (error) {
    console.error(`❌ Error handling product update:`, error.message);
    throw error;
  }
}

/**
 * Handle stock changes - alert if low stock
 */
async function handleStockChanged(data) {
  const { productId, newStock, oldStock, threshold = 10 } = data;

  if (!productId) {
    console.warn("⚠️ Stock changed event missing productId");
    return;
  }

  try {
    console.log(`📊 Product ${productId} stock: ${oldStock} → ${newStock}`);

    // Alert if stock is low
    if (newStock < threshold) {
      console.warn(
        `⚠️ LOW STOCK ALERT: Product ${productId} has only ${newStock} units (threshold: ${threshold})`
      );

      // Find pending sales with this product
      const pendingSales = await SalesItem.findAll({
        where: { productId },
        include: [
          {
            model: Sale,
            as: "sale",
            where: { status: "initiated" },
            attributes: ["saleId", "companyId", "customerId"],
          },
        ],
      });

      if (pendingSales.length > 0) {
        console.warn(
          `⚠️ ${pendingSales.length} pending sales affected by low stock`
        );
      }
    }

    console.log(`✅ Stock change recorded`);
  } catch (error) {
    console.error(`❌ Error handling stock change:`, error.message);
    throw error;
  }
}

/**
 * Handle out of stock - alert and check pending sales
 */
async function handleOutOfStock(data) {
  const { productId } = data;

  if (!productId) {
    console.warn("⚠️ Out of stock event missing productId");
    return;
  }

  try {
    console.warn(`🚫 Product ${productId} is OUT OF STOCK`);

    // Find pending sales with this product
    const pendingSales = await SalesItem.findAll({
      where: { productId },
      include: [
        {
          model: Sale,
          as: "sale",
          where: { status: "initiated" },
          attributes: ["saleId", "companyId", "customerId", "customerName"],
        },
      ],
    });

    if (pendingSales.length > 0) {
      console.warn(
        `🚫 ALERT: ${pendingSales.length} pending sales have out-of-stock products`
      );

      // Log affected sales for manual review
      pendingSales.forEach((item) => {
        console.warn(
          `  - Sale ${item.sale.saleId} (Customer: ${item.sale.customerName})`
        );
      });
    }

    console.log(`✅ Out of stock event recorded`);
  } catch (error) {
    console.error(`❌ Error handling out of stock:`, error.message);
    throw error;
  }
}

/**
 * Handle product deletion - mark as discontinued
 */
async function handleProductDeleted(data) {
  const { productId } = data;

  if (!productId) {
    console.warn("⚠️ Product deleted event missing productId");
    return;
  }

  try {
    console.log(`🗑️ Product ${productId} has been deleted from inventory`);

    // Find all sales items with this product
    const salesItems = await SalesItem.findAll({
      where: { productId },
      attributes: ["saleId", "productId", "productName"],
    });

    if (salesItems.length > 0) {
      console.log(
        `📝 Found ${salesItems.length} historical sales with deleted product`
      );
      // Historical data is preserved for audit trail
    }

    console.log(`✅ Product deletion recorded`);
  } catch (error) {
    console.error(`❌ Error handling product deletion:`, error.message);
    throw error;
  }
}

/**
 * Handle price changes - log for audit trail
 */
async function handlePriceChanged(data) {
  const { productId, oldPrice, newPrice } = data;

  if (!productId) {
    console.warn("⚠️ Price changed event missing productId");
    return;
  }

  try {
    console.log(`💲 Product ${productId} price: ${oldPrice} → ${newPrice}`);

    // Note: We don't update prices in completed sales (historical data)
    // Only log for audit purposes
    console.log(`✅ Price change recorded for audit trail`);
  } catch (error) {
    console.error(`❌ Error handling price change:`, error.message);
    throw error;
  }
}
