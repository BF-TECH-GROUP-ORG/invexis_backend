"use strict";

const Notification = require("../../models/Notification");
const notificationQueue = require("../../config/queue");
const logger = require("../../utils/logger");
const { cleanValue, cleanAmount } = require("../../utils/dataSanitizer");

/**
 * Handles product and inventory events
 * @param {Object} event - The product event
 * @param {string} routingKey - Event routing key
 */
module.exports = async function handleProductEvent(event, routingKey) {
  try {
    const { type, data } = event;

    logger.info(`📦 Processing product event: ${type}`, data);

    switch (type) {
      case "inventory.product.created":
      case "product.created":
        await handleProductCreated(data);
        break;

      case "inventory.product.updated":
      case "product.updated":
        await handleProductUpdated(data);
        break;

      case "inventory.product.deleted":
      case "product.deleted":
        await handleProductDeleted(data);
        break;

      case "inventory.low_stock":
      case "inventory.product.low_stock":
        await handleLowStock(data);
        break;

      case "inventory.out_of_stock":
      case "inventory.product.out_of_stock":
        await handleOutOfStock(data);
        break;

      case "inventory.stock.updated":
        // Legacy fallback
        // case "inventory.product.updated": // Removed to prevent double handling if migrated
        await handleStockUpdate(data);
        break;

      case "inventory.bulk.stock_in":
        await handleBulkStockIn(data);
        break;

      case "inventory.bulk.stock_out":
        await handleBulkStockOut(data);
        break;

      case "inventory.transfer.created":
        await handleTransferCreated(data);
        break;

      case "inventory.transfer.bulk.intra":
        await handleBulkTransferIntra(data);
        break;

      case "inventory.transfer.bulk.cross":
        await handleBulkTransferCross(data);
        break;

      case "inventory.transfer.cross":
        await handleTransferCross(data);
        break;

      case "inventory.alert.triggered":
      case "inventory.alert.product_expiring":
      case "inventory.alert.product_expired":
      case "inventory.alert.low_stock":
      case "inventory.alert.out_of_stock":
        await handleInventoryAlert(data, routingKey);
        break;

      default:
        logger.warn(`⚠️ Unhandled product event type: ${type}`);
    }
  } catch (error) {
    logger.error(`❌ Error handling product event: ${error.message}`);
    throw error;
  }
};

/**
 * Handle product creation
 */
/**
 * Handle product creation
 */
async function handleProductCreated(data) {
  const { productId, productName, companyId, createdBy, createdByName } = data;

  if (!productId || !companyId) {
    logger.warn("⚠️ Product created event missing required fields");
    return;
  }

  try {
    logger.info(`📦 New product created: ${productName} (${productId})`);

    const { dispatchBroadcastEvent } = require("../../services/dispatcher");

    const sanitizedProduct = cleanValue(productName, "Product");
    const sanitizedUser = cleanValue(createdByName, "Staff");

    // Broadcast to company admins/managers
    await dispatchBroadcastEvent({
      event: "product.created",
      data: {
        productName: sanitizedProduct,
        userName: sanitizedUser,
        productId,
        ...data
      },
      companyId,
      shopId: data.shopId,
      templateName: "product.created",
      channels: ["inApp", "push"],
      scope: "company",
      roles: ["company_admin", "worker"]
    });

    logger.info(`✅ Product creation notification broadcasted for product ${productId}`);
  } catch (error) {
    logger.error(`❌ Error creating product notification:`, error.message);
    throw error;
  }
}

/**
 * Handle product update
 */
async function handleProductUpdated(data) {
  const { productId, productName, companyId } = data;
  if (!productId || !companyId) return;

  try {
    const { dispatchBroadcastEvent } = require("../../services/dispatcher");
    const sanitizedProduct = cleanValue(productName, "Product");

    await dispatchBroadcastEvent({
      event: "inventory.product.updated",
      data: {
        productName: sanitizedProduct,
        productId,
        ...data
      },
      companyId,
      shopId: data.shopId,
      templateName: "product.updated",
      channels: ["inApp", "push"],
      scope: "company",
      roles: ["company_admin", "worker"]
    });
    logger.info(`✅ Product update notification broadcasted for ${productId}`);
  } catch (error) {
    logger.error(`❌ Error in handleProductUpdated:`, error.message);
  }
}

/**
 * Handle product deletion
 */
async function handleProductDeleted(data) {
  const { productId, productName, companyId, userName } = data;
  if (!productId || !companyId) return;

  try {
    const { dispatchBroadcastEvent } = require("../../services/dispatcher");
    const sanitizedProduct = cleanValue(productName, "Product");
    const sanitizedUser = cleanValue(userName, "Staff");

    await dispatchBroadcastEvent({
      event: "inventory.product.deleted",
      data: {
        productName: sanitizedProduct,
        userName: sanitizedUser,
        productId,
        ...data
      },
      companyId,
      shopId: data.shopId,
      templateName: "product.deleted",
      channels: ["inApp", "push"],
      scope: "company",
      roles: ["company_admin", "worker"]
    });
    logger.info(`✅ Product deletion notification broadcasted for ${productId}`);
  } catch (error) {
    logger.error(`❌ Error in handleProductDeleted:`, error.message);
  }
}

/**
 * Handle low stock alert
 */
async function handleLowStock(data) {
  const { productId, productName, companyId, currentStock, threshold, sku, suggestedReorderQty, percentageOfThreshold } = data;

  if (!productId || !companyId) {
    logger.warn("⚠️ Low stock event missing required fields");
    return;
  }

  try {
    logger.warn(`⚠️ Low stock alert: ${productName} (Current: ${currentStock}, Threshold: ${threshold})`);

    const { dispatchBroadcastEvent } = require("../../services/dispatcher");

    const sanitizedProduct = cleanValue(productName, "Product");
    const sanitizedQty = cleanAmount(currentStock, 0);

    await dispatchBroadcastEvent({
      event: "inventory.low_stock",
      data: {
        productName: sanitizedProduct,
        currentStock: sanitizedQty, // Explicitly map to template variable
        quantity: sanitizedQty,     // Backward compatibility for legacy template
        productId,
        sku: cleanValue(sku, ""),
        threshold: cleanAmount(threshold, 0),
        suggestedReorderQty: cleanAmount(suggestedReorderQty, 0),
        percentageOfThreshold: cleanAmount(percentageOfThreshold, 0),
        ...data
      },
      companyId,
      shopId: data.shopId,
      templateName: "inventory.low_stock", // Upgraded to rich template
      channels: ["email", "push", "inApp"],
      scope: "company",
      roles: ["company_admin", "worker"],
      priority: "high"
    });

    logger.info(`✅ Low stock notification broadcasted for product ${productId}`);
  } catch (error) {
    logger.error(`❌ Error creating low stock notification:`, error.message);
    throw error;
  }
}

/**
 * Handle out of stock alert
 */
async function handleOutOfStock(data) {
  const { productId, productName, companyId, sku, threshold } = data;

  if (!productId || !companyId) {
    logger.warn("⚠️ Out of stock event missing required fields");
    return;
  }

  try {
    logger.error(`❌ Out of stock: ${productName}`);

    const { dispatchBroadcastEvent } = require("../../services/dispatcher");

    const sanitizedProduct = cleanValue(productName, "Product");

    await dispatchBroadcastEvent({
      event: "inventory.out_of_stock",
      data: {
        productName: sanitizedProduct,
        productId,
        sku: cleanValue(sku, ""),
        threshold: cleanAmount(threshold, 0),
        ...data
      },
      companyId,
      shopId: data.shopId,
      templateName: "inventory.out_of_stock", // Upgraded to rich template
      channels: ["email", "push", "inApp"],
      scope: "company",
      roles: ["company_admin", "worker"],
      priority: "high"
    });

    logger.info(`✅ Out of stock notification broadcasted for product ${productId}`);
  } catch (error) {
    logger.error(`❌ Error creating out of stock notification:`, error.message);
    throw error;
  }
}


/**
 * Handle individual stock update (stock in/out)
 */
async function handleStockUpdate(data) {
  const { productId, productName, companyId, current, previous, userId, change, type } = data;
  if (!productId || !companyId) return;

  try {
    const { dispatchBroadcastEvent } = require("../../services/dispatcher");
    // Fallback calculation if change/type not provided (legacy events)
    const calculatedChange = change !== undefined ? change : (current - previous);
    const resolvedType = type || (calculatedChange > 0 ? "restock" : "removal");

    await dispatchBroadcastEvent({
      event: "inventory.stock.updated",
      data: {
        productId,
        productName: cleanValue(productName, "Product"),
        current: cleanAmount(current, 0),
        previous: cleanAmount(previous, 0),
        change: cleanAmount(calculatedChange, 0),
        type: resolvedType,
        ...data
      },
      companyId,
      shopId: data.shopId,
      templateName: "inventory.stock.updated",
      channels: ["inApp"],
      scope: "company",
      roles: ["company_admin", "worker"]
    });
  } catch (error) {
    logger.error(`❌ Error in handleStockUpdate:`, error.message);
  }
}

/**
 * Handle bulk stock in
 */
async function handleBulkStockIn(data) {
  const { companyId, items, totalRequested, successCount } = data;
  if (!companyId) return;

  try {
    const { dispatchBroadcastEvent } = require("../../services/dispatcher");
    const sanitizedTotal = cleanAmount(totalRequested, 0);
    const sanitizedSuccess = cleanAmount(successCount, 0);

    await dispatchBroadcastEvent({
      event: "inventory.bulk.stock_in",
      data: {
        totalRequested: sanitizedTotal,
        successCount: sanitizedSuccess,
        itemCount: items?.length || 0,
        ...data
      },
      companyId,
      shopId: data.shopId,
      templateName: "inventory.bulk.stock_in",
      channels: ["inApp", "push"],
      scope: "company",
      roles: ["company_admin", "worker"]
    });
  } catch (error) {
    logger.error(`❌ Error in handleBulkStockIn:`, error.message);
  }
}

/**
 * Handle bulk stock out
 */
async function handleBulkStockOut(data) {
  const { companyId, items, totalRequested, successCount } = data;
  if (!companyId) return;

  try {
    const { dispatchBroadcastEvent } = require("../../services/dispatcher");
    const sanitizedTotal = cleanAmount(totalRequested, 0);
    const sanitizedSuccess = cleanAmount(successCount, 0);

    await dispatchBroadcastEvent({
      event: "inventory.bulk.stock_out",
      data: {
        totalRequested: sanitizedTotal,
        successCount: sanitizedSuccess,
        itemCount: items?.length || 0,
        ...data
      },
      companyId,
      shopId: data.shopId,
      templateName: "inventory.bulk.stock_out",
      channels: ["inApp", "push"],
      scope: "company",
      roles: ["company_admin", "worker"]
    });
  } catch (error) {
    logger.error(`❌ Error in handleBulkStockOut:`, error.message);
  }
}

/**
 * Handle individual transfer
 */
async function handleTransferCreated(data) {
  const { companyId, sourceShopId, destinationShopId, productName, quantity } = data;
  if (!companyId) return;

  try {
    const { dispatchBroadcastEvent } = require("../../services/dispatcher");
    const sanitizedProduct = cleanValue(productName, "Product");
    const sanitizedQty = cleanAmount(quantity, 0);

    // Notify source shop history
    if (sourceShopId) {
      await dispatchBroadcastEvent({
        event: "inventory.transfer.created",
        data: {
          productName: sanitizedProduct,
          sourceShopId: cleanValue(sourceShopId, "Source"),
          destinationShopId: cleanValue(destinationShopId, "Destination"),
          quantity: sanitizedQty,
          ...data
        },
        companyId,
        shopId: sourceShopId,
        departmentId: "management",
        templateName: "inventory.transfer.created",
        channels: ["inApp", "push"],
        scope: "company",
        roles: ["company_admin", "worker"]
      });
    }

    // Notify destination shop history
    if (destinationShopId && destinationShopId !== sourceShopId) {
      await dispatchBroadcastEvent({
        event: "inventory.transfer.created",
        data: {
          productName: sanitizedProduct,
          sourceShopId: cleanValue(sourceShopId, "Source"),
          destinationShopId: cleanValue(destinationShopId, "Destination"),
          quantity: sanitizedQty,
          ...data
        },
        companyId,
        shopId: destinationShopId,
        departmentId: "management",
        templateName: "inventory.transfer.created",
        channels: ["inApp", "push"],
        scope: "company",
        roles: ["company_admin", "worker"]
      });
    }
  } catch (error) {
    logger.error(`❌ Error in handleTransferCreated:`, error.message);
  }
}

/**
 * Handle bulk intra-company transfer
 */
async function handleBulkTransferIntra(data) {
  const { companyId, sourceShopId, destinationShopId, successCount } = data;
  if (!companyId) return;

  try {
    const { dispatchBroadcastEvent } = require("../../services/dispatcher");
    const sanitizedCount = cleanAmount(successCount, 0);

    // Notify source shop history
    if (sourceShopId) {
      await dispatchBroadcastEvent({
        event: "inventory.transfer.bulk.intra",
        data: {
          sourceShopId: cleanValue(sourceShopId, "Source"),
          destinationShopId: cleanValue(destinationShopId, "Destination"),
          count: sanitizedCount,
          ...data
        },
        companyId,
        shopId: sourceShopId,
        departmentId: "management",
        templateName: "inventory.transfer.bulk.intra",
        channels: ["inApp", "push"],
        scope: "company",
        roles: ["company_admin", "worker"]
      });
    }

    // Notify destination shop history
    if (destinationShopId && destinationShopId !== sourceShopId) {
      await dispatchBroadcastEvent({
        event: "inventory.transfer.bulk.intra",
        data: {
          sourceShopId: cleanValue(sourceShopId, "Source"),
          destinationShopId: cleanValue(destinationShopId, "Destination"),
          count: sanitizedCount,
          ...data
        },
        companyId,
        shopId: destinationShopId,
        departmentId: "management",
        templateName: "inventory.transfer.bulk.intra",
        channels: ["inApp", "push"],
        scope: "company",
        roles: ["company_admin", "worker"]
      });
    }
  } catch (error) {
    logger.error(`❌ Error in handleBulkTransferIntra:`, error.message);
  }
}

/**
 * Handle bulk cross-company transfer
 */
async function handleBulkTransferCross(data) {
  const { sourceCompanyId, toCompanyId, successCount } = data;
  if (!sourceCompanyId && !toCompanyId) return;

  try {
    const { dispatchBroadcastEvent } = require("../../services/dispatcher");

    const sanitizedCount = cleanAmount(successCount, 0);

    // Notify source company
    if (sourceCompanyId) {
      await dispatchBroadcastEvent({
        event: "inventory.transfer.bulk.cross.sent",
        data: {
          targetCompanyId: toCompanyId,
          count: sanitizedCount,
          ...data
        },
        companyId: sourceCompanyId,
        shopId: data.sourceShopId,
        departmentId: "management",
        templateName: "inventory.transfer.bulk.cross.sent",
        channels: ["inApp", "push"],
        scope: "company",
        roles: ["company_admin", "worker"]
      });
    }

    // Notify destination company
    if (toCompanyId) {
      await dispatchBroadcastEvent({
        event: "inventory.transfer.bulk.cross.received",
        data: {
          sourceCompanyId: sourceCompanyId,
          count: sanitizedCount,
          ...data
        },
        companyId: toCompanyId,
        shopId: data.toShopId,
        departmentId: "management",
        templateName: "inventory.transfer.bulk.cross.received",
        channels: ["inApp", "push"],
        scope: "company",
        roles: ["company_admin", "worker"]
      });
    }
  } catch (error) {
    logger.error(`❌ Error in handleBulkTransferCross:`, error.message);
  }
}

/**
 * Handle individual cross-company transfer
 */
async function handleTransferCross(data) {
  const { sourceCompanyId, toCompanyId, productName, quantity } = data;
  if (!sourceCompanyId && !toCompanyId) return;

  try {
    const { dispatchBroadcastEvent } = require("../../services/dispatcher");

    const sanitizedProduct = cleanValue(productName, "Product");
    const sanitizedQty = cleanAmount(quantity, 0);

    // Notify source company
    if (sourceCompanyId) {
      await dispatchBroadcastEvent({
        event: "inventory.transfer.cross.sent",
        data: {
          productName: sanitizedProduct,
          targetCompanyId: toCompanyId,
          quantity: sanitizedQty,
          ...data
        },
        companyId: sourceCompanyId,
        shopId: data.sourceShopId,
        departmentId: "management",
        templateName: "inventory.transfer.cross.sent",
        channels: ["inApp", "push"],
        scope: "company",
        roles: ["company_admin", "worker"]
      });
    }

    // Notify destination company
    if (toCompanyId) {
      await dispatchBroadcastEvent({
        event: "inventory.transfer.cross.received",
        data: {
          productName: sanitizedProduct,
          sourceCompanyId: sourceCompanyId,
          quantity: sanitizedQty,
          ...data
        },
        companyId: toCompanyId,
        shopId: data.toShopId,
        departmentId: "management",
        templateName: "inventory.transfer.cross.received",
        channels: ["inApp", "push"],
        scope: "company",
        roles: ["company_admin", "worker"]
      });
    }
  } catch (error) {
    logger.error(`❌ Error in handleTransferCross:`, error.message);
  }
}

/**
 * Handle generic inventory alerts (Expirations, etc)
 */
async function handleInventoryAlert(data, routingKey) {
  const { companyId, shopId, type, productId, message } = data;
  const alertData = data.data || {}; // Specific payload from Alert model

  if (!companyId) return;

  try {
    const { dispatchBroadcastEvent } = require("../../services/dispatcher");

    // Map internal alert type to notification event name
    // internal: product_expiring -> notif: inventory.alert.product_expiring
    // internal: product_expired -> notif: inventory.alert.product_expired
    const eventName = `inventory.alert.${type}`;

    await dispatchBroadcastEvent({
      event: eventName,
      data: {
        ...alertData,
        message: cleanValue(message, ""),
        alertId: data._id
      },
      companyId,
      shopId,
      templateName: eventName,
      channels: ["email", "push", "inApp"],
      scope: "company",
      roles: ["company_admin", "worker"],
      priority: type === 'product_expired' ? 'urgent' : 'high'
    });

    logger.info(`✅ Inventory alert notification dispatched: ${eventName} for ${productId}`);
  } catch (error) {
    logger.error(`❌ Error in handleInventoryAlert:`, error.message);
  }
}
