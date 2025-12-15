/**
 * Stock Monitoring Service
 * Real-time and scheduled monitoring of inventory levels
 * Triggers alerts, backorders, and notifications based on ProductStock configuration
 */

const Product = require('../models/Product');
const ProductStock = require('../models/ProductStock');
const ProductVariation = require('../models/ProductVariation');
const Alert = require('../models/Alert');
const StockChange = require('../models/StockChange');
const logger = require('../utils/logger');
const mongoose = require('mongoose');
const producer = require('../events/producer');

class StockMonitoringService {
  /**
   * Monitor all products for low stock and trigger alerts
   * @param {String} companyId - Company ID
   * @param {String} shopId - Optional Shop ID
   */
  static async monitorLowStock(companyId, shopId = null) {
    try {
      logger.info(`📊 Starting low stock monitoring for company: ${companyId}`);

      const match = { companyId };
      if (shopId) match.shopId = shopId;

      // Get all ProductStock records with their linked variations
      const stockRecords = await ProductStock.aggregate([
        { $match: {} }, // All stock records
        { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
        { $unwind: '$product' },
        { $match: { 'product.companyId': companyId, ...(shopId ? { 'product.shopId': shopId } : {}) } },
        { $lookup: { from: 'productvariations', localField: 'variationId', foreignField: '_id', as: 'variation' } },
        { $unwind: { path: '$variation', preserveNullAndEmptyArrays: true } }
      ]);

      let alertsGenerated = 0;

      for (const stockRecord of stockRecords) {
        try {
          // Get current stock quantity
          let currentStock = 0;
          if (stockRecord.variation) {
            currentStock = stockRecord.variation.stockQty || 0;
          } else {
            // Sum all variations for this product
            const pvAgg = await ProductVariation.aggregate([
              { $match: { productId: stockRecord.product._id } },
              { $group: { _id: null, totalQty: { $sum: '$stockQty' } } }
            ]);
            currentStock = pvAgg[0]?.totalQty || 0;
          }

          const { product, lowStockThreshold, allowBackorder } = stockRecord;
          const companyId = product.companyId;
          const shopId = product.shopId;

          // Check for out of stock
          if (currentStock === 0) {
            await this.handleOutOfStock(product, companyId, shopId, allowBackorder, stockRecord);
            alertsGenerated++;
          }
          // Check for low stock
          else if (currentStock <= lowStockThreshold) {
            await this.handleLowStock(product, currentStock, lowStockThreshold, companyId, shopId, stockRecord);
            alertsGenerated++;
          }
          // Check if stock recovered (was low, now normal)
          else {
            await this.handleStockRecovered(product, currentStock, companyId, shopId);
          }
        } catch (error) {
          logger.error(`Error monitoring stock for product ${stockRecord.productId}: ${error.message}`);
        }
      }

      logger.info(`✅ Low stock monitoring completed. Alerts generated: ${alertsGenerated}`);
      return alertsGenerated;
    } catch (error) {
      logger.error(`Failed to monitor low stock: ${error.message}`);
      throw error;
    }
  }

  /**
   * Handle out of stock scenario
   */
  static async handleOutOfStock(product, companyId, shopId, allowBackorder, stockRecord) {
    try {
      const scope = shopId ? 'shop' : 'company';

      // Check if alert already exists and is unresolved
      const existingAlert = await Alert.findOne({
        companyId,
        shopId,
        type: 'out_of_stock',
        productId: product._id,
        isResolved: false
      });

      if (existingAlert) {
        // Update existing alert
        existingAlert.message = `🔴 OUT OF STOCK: ${product.name}`;
        existingAlert.priority = allowBackorder ? 'high' : 'critical';
        existingAlert.data = {
          productId: product._id.toString(),
          productName: product.name,
          sku: product.sku,
          currentStock: 0,
          allowBackorder: allowBackorder,
          timestamp: new Date().toISOString()
        };
        await existingAlert.save();
      } else {
        // Create new alert
        await Alert.create({
          companyId,
          shopId,
          scope,
          type: 'out_of_stock',
          productId: product._id,
          priority: allowBackorder ? 'high' : 'critical',
          message: `🔴 OUT OF STOCK: ${product.name}`,
          description: allowBackorder 
            ? `${product.name} is out of stock but backorders are allowed. Set up backorder queue.`
            : `${product.name} is out of stock. URGENT: Restock immediately or mark as unavailable.`,
          data: {
            productId: product._id.toString(),
            productName: product.name,
            sku: product.sku,
            currentStock: 0,
            allowBackorder: allowBackorder,
            timestamp: new Date().toISOString(),
            suggestedReorderQty: stockRecord.suggestedReorderQty || stockRecord.minReorderQty
          }
        });
      }

      // Emit RabbitMQ event for other services
      try {
        await producer.emit('inventory.product.out_of_stock', {
          productId: product._id.toString(),
          productName: product.name,
          sku: product.sku,
          currentStock: 0,
          allowBackorder: allowBackorder,
          suggestedReorderQty: stockRecord.suggestedReorderQty || stockRecord.minReorderQty,
          companyId,
          shopId,
          timestamp: new Date().toISOString()
        }, {
          companyId,
          shopId,
          traceId: `stock-monitor-${Date.now()}`
        });
      } catch (error) {
        logger.error(`Failed to emit out_of_stock event: ${error.message}`);
      }

      logger.warn(`🔴 OUT OF STOCK ALERT: ${product.name} (${companyId}${shopId ? `/${shopId}` : ''})`);
    } catch (error) {
      logger.error(`Failed to handle out of stock: ${error.message}`);
    }
  }

  /**
   * Handle low stock scenario
   */
  static async handleLowStock(product, currentStock, threshold, companyId, shopId, stockRecord) {
    try {
      const scope = shopId ? 'shop' : 'company';

      // Check if alert already exists and is unresolved
      const existingAlert = await Alert.findOne({
        companyId,
        shopId,
        type: 'low_stock',
        productId: product._id,
        isResolved: false
      });

      const percentage = Math.round((currentStock / threshold) * 100);

      if (existingAlert) {
        // Update existing alert
        existingAlert.message = `⚠️ LOW STOCK: ${product.name}`;
        existingAlert.priority = percentage < 50 ? 'high' : 'medium';
        existingAlert.threshold = threshold;
        existingAlert.data = {
          productId: product._id.toString(),
          productName: product.name,
          sku: product.sku,
          currentStock: currentStock,
          threshold: threshold,
          percentageOfThreshold: percentage,
          daysUntilStockout: stockRecord.stockoutRiskDays || 'N/A',
          suggestedReorderQty: stockRecord.suggestedReorderQty || stockRecord.minReorderQty,
          timestamp: new Date().toISOString()
        };
        await existingAlert.save();
      } else {
        // Create new alert
        await Alert.create({
          companyId,
          shopId,
          scope,
          type: 'low_stock',
          productId: product._id,
          priority: percentage < 50 ? 'high' : 'medium',
          threshold: threshold,
          message: `⚠️ LOW STOCK: ${product.name}`,
          description: `${product.name} stock is ${currentStock}/${threshold}. ${percentage < 50 ? 'URGENT reorder recommended.' : 'Monitor and prepare reorder.'}`,
          data: {
            productId: product._id.toString(),
            productName: product.name,
            sku: product.sku,
            currentStock: currentStock,
            threshold: threshold,
            percentageOfThreshold: percentage,
            daysUntilStockout: stockRecord.stockoutRiskDays || 'N/A',
            suggestedReorderQty: stockRecord.suggestedReorderQty || stockRecord.minReorderQty,
            timestamp: new Date().toISOString()
          }
        });
      }

      // Emit RabbitMQ event for other services
      try {
        await producer.emit('inventory.product.low_stock', {
          productId: product._id.toString(),
          productName: product.name,
          sku: product.sku,
          currentStock: currentStock,
          threshold: threshold,
          percentageOfThreshold: percentage,
          daysUntilStockout: stockRecord.stockoutRiskDays || null,
          suggestedReorderQty: stockRecord.suggestedReorderQty || stockRecord.minReorderQty,
          priority: percentage < 50 ? 'high' : 'medium',
          companyId,
          shopId,
          timestamp: new Date().toISOString()
        }, {
          companyId,
          shopId,
          traceId: `stock-monitor-${Date.now()}`
        });
      } catch (error) {
        logger.error(`Failed to emit low_stock event: ${error.message}`);
      }

      logger.warn(`⚠️ LOW STOCK ALERT: ${product.name} (${currentStock}/${threshold}) (${companyId}${shopId ? `/${shopId}` : ''})`);
    } catch (error) {
      logger.error(`Failed to handle low stock: ${error.message}`);
    }
  }

  /**
   * Handle stock recovery (was low, now above threshold)
   */
  static async handleStockRecovered(product, currentStock, companyId, shopId) {
    try {
      // Find and resolve low stock alerts
      const lowStockAlert = await Alert.findOne({
        companyId,
        shopId,
        type: 'low_stock',
        productId: product._id,
        isResolved: false
      });

      if (lowStockAlert) {
        lowStockAlert.isResolved = true;
        lowStockAlert.resolvedAt = new Date();
        lowStockAlert.description = `Stock recovered. Current level: ${currentStock}`;
        await lowStockAlert.save();

        logger.info(`✅ STOCK RECOVERED: ${product.name} is back to normal levels`);
      }

      // Find and resolve out of stock alerts only if it wasn't out of stock before
      const outOfStockAlert = await Alert.findOne({
        companyId,
        shopId,
        type: 'out_of_stock',
        productId: product._id,
        isResolved: false
      });

      if (outOfStockAlert && currentStock > 0) {
        outOfStockAlert.isResolved = true;
        outOfStockAlert.resolvedAt = new Date();
        outOfStockAlert.description = `Stock replenished. Current level: ${currentStock}`;
        await outOfStockAlert.save();

        logger.info(`✅ OUT OF STOCK RESOLVED: ${product.name} back in stock`);
      }
    } catch (error) {
      logger.error(`Failed to handle stock recovery: ${error.message}`);
    }
  }

  /**
   * Monitor for backorder opportunities
   * Identifies products that can fulfill pending orders
   */
  static async monitorBackorders(companyId, shopId = null) {
    try {
      logger.info(`📦 Starting backorder monitoring for company: ${companyId}`);

      const match = { companyId };
      if (shopId) match.shopId = shopId;

      // Get all out of stock alerts with allowBackorder = true
      const backorderAlerts = await Alert.find({
        companyId,
        ...(shopId && { shopId }),
        type: 'out_of_stock',
        isResolved: false,
        'data.allowBackorder': true
      });

      let processedBackorders = 0;

      for (const alert of backorderAlerts) {
        try {
          const productId = alert.data.productId;
          if (!productId) continue;

          // Get current stock
          const pvAgg = await ProductVariation.aggregate([
            { $match: { productId: mongoose.Types.ObjectId(productId) } },
            { $group: { _id: null, totalQty: { $sum: '$stockQty' } } }
          ]);
          const currentStock = pvAgg[0]?.totalQty || 0;

          // If stock has been replenished, create backorder fulfillment alert
          if (currentStock > 0) {
            const backorderFulfillmentAlert = await Alert.create({
              companyId: alert.companyId,
              shopId: alert.shopId,
              scope: alert.scope,
              type: 'stock_received',
              productId: alert.productId,
              priority: 'high',
              message: `📦 BACKORDER FULFILLMENT: ${alert.data.productName}`,
              description: `Stock has been replenished for backorder items. ${currentStock} units available to fulfill orders.`,
              data: {
                productId: alert.data.productId,
                productName: alert.data.productName,
                sku: alert.data.sku,
                availableStock: currentStock,
                previousOutOfStockAlert: alert._id.toString(),
                timestamp: new Date().toISOString()
              }
            });

            // Emit RabbitMQ event for backorder fulfillment
            try {
              await producer.emit('inventory.backorder.fulfilled', {
                productId: alert.data.productId,
                productName: alert.data.productName,
                sku: alert.data.sku,
                availableStock: currentStock,
                previousOutOfStockAlertId: alert._id.toString(),
                companyId: alert.companyId,
                shopId: alert.shopId,
                timestamp: new Date().toISOString()
              }, {
                companyId: alert.companyId,
                shopId: alert.shopId,
                traceId: `backorder-monitor-${Date.now()}`
              });
            } catch (error) {
              logger.error(`Failed to emit backorder fulfilled event: ${error.message}`);
            }

            logger.info(`📦 Backorder fulfillment alert created for ${alert.data.productName}`);
            processedBackorders++;
          }
        } catch (error) {
          logger.error(`Error processing backorder for alert ${alert._id}: ${error.message}`);
        }
      }

      logger.info(`✅ Backorder monitoring completed. Processed: ${processedBackorders}`);
      return processedBackorders;
    } catch (error) {
      logger.error(`Failed to monitor backorders: ${error.message}`);
      throw error;
    }
  }

  /**
   * Record stock changes in the database
   * Called whenever stock is adjusted/sold/received
   */
  static async recordStockChange(productId, changeType, quantity, metadata = {}) {
    try {
      const change = await StockChange.create({
        productId,
        type: changeType, // 'sale', 'adjustment', 'received', 'returned', etc.
        qty: changeType === 'sale' || changeType === 'adjustment' ? -quantity : quantity,
        companyId: metadata.companyId,
        shopId: metadata.shopId,
        reference: metadata.reference || null,
        reason: metadata.reason || null,
        notes: metadata.notes || null,
        meta: {
          unitPrice: metadata.unitPrice || 0,
          totalValue: (metadata.unitPrice || 0) * quantity,
          performedBy: metadata.performedBy || null,
          ...metadata.meta
        },
        createdAt: new Date()
      });

      // Emit RabbitMQ event for other services
      try {
        await producer.emit(`inventory.stock.${changeType}`, {
          productId: productId.toString(),
          changeType: changeType,
          quantity: quantity,
          reference: metadata.reference || null,
          reason: metadata.reason || null,
          performedBy: metadata.performedBy || 'system',
          companyId: metadata.companyId,
          shopId: metadata.shopId,
          unitPrice: metadata.unitPrice || 0,
          totalValue: (metadata.unitPrice || 0) * quantity,
          timestamp: new Date().toISOString()
        }, {
          companyId: metadata.companyId,
          shopId: metadata.shopId,
          traceId: `stock-change-${Date.now()}`
        });
      } catch (error) {
        logger.error(`Failed to emit stock change event: ${error.message}`);
      }

      logger.info(`📝 Stock change recorded: ${changeType} of ${quantity} units for product ${productId}`);
      return change;
    } catch (error) {
      logger.error(`Failed to record stock change: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get stock status summary for a product
   */
  static async getStockStatus(productId, companyId, shopId = null) {
    try {
      // Get product stock configuration
      const productStock = await ProductStock.findOne({
        productId: mongoose.Types.ObjectId(productId)
      });

      // Get current stock quantity
      const pvAgg = await ProductVariation.aggregate([
        { $match: { productId: mongoose.Types.ObjectId(productId) } },
        { $group: { _id: null, totalQty: { $sum: '$stockQty' } } }
      ]);
      const currentStock = pvAgg[0]?.totalQty || 0;

      // Get active alerts
      const alerts = await Alert.find({
        productId: mongoose.Types.ObjectId(productId),
        companyId,
        ...(shopId && { shopId }),
        isResolved: false,
        type: { $in: ['low_stock', 'out_of_stock'] }
      });

      // Determine status
      let status = 'HEALTHY';
      let statusCode = 'green';
      
      if (currentStock === 0) {
        status = 'OUT_OF_STOCK';
        statusCode = 'red';
      } else if (productStock && currentStock <= productStock.lowStockThreshold) {
        status = 'LOW_STOCK';
        statusCode = currentStock <= (productStock.lowStockThreshold * 0.5) ? 'red' : 'yellow';
      }

      return {
        productId,
        currentStock,
        status,
        statusCode,
        lowStockThreshold: productStock?.lowStockThreshold || 10,
        allowBackorder: productStock?.allowBackorder || false,
        suggestedReorderQty: productStock?.suggestedReorderQty || 0,
        daysUntilStockout: productStock?.stockoutRiskDays || null,
        activeAlerts: alerts.length,
        alerts: alerts.map(a => ({
          id: a._id,
          type: a.type,
          priority: a.priority,
          message: a.message
        }))
      };
    } catch (error) {
      logger.error(`Failed to get stock status: ${error.message}`);
      throw error;
    }
  }
}

module.exports = StockMonitoringService;
