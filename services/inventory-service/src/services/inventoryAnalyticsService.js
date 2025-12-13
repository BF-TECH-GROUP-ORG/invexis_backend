/**
 * Inventory Analytics Service
 * Provides comprehensive profit, margin, and forecasting analytics
 * Company-level, shop-level, and product-level reporting
 */

const Product = require('../models/Product');
const ProductPricing = require('../models/ProductPricing');
const ProductStock = require('../models/ProductStock');
const StockChange = require('../models/StockChange');
const ProductVariation = require('../models/ProductVariation');
const logger = require('../utils/logger');

class InventoryAnalyticsService {
  /**
   * Get company-wide inventory metrics
   * @param {string} companyId
   * @param {object} options - filters like startDate, endDate
   * @returns {object} - total profit, margin, stock value, etc.
   */
  static async getCompanyMetrics(companyId, options = {}) {
    try {
      const { startDate, endDate } = options;
      const dateFilter = {};
      if (startDate) dateFilter.$gte = new Date(startDate);
      if (endDate) dateFilter.$lte = new Date(endDate);

      // Total revenue from sales
      const salesAgg = await StockChange.aggregate([
        {
          $match: {
            companyId,
            type: 'sale',
            ...(Object.keys(dateFilter).length && { createdAt: dateFilter })
          }
        },
        {
          $group: {
            _id: null,
            totalUnits: { $sum: { $abs: '$qty' } },
            totalRevenue: {
              $sum: { $multiply: [{ $abs: '$qty' }, { $ifNull: ['$meta.unitPrice', 0] }] }
            },
            totalTransactions: { $sum: 1 }
          }
        }
      ]);

      // Total cost of goods sold
      const costAgg = await ProductPricing.aggregate([
        {
          $lookup: {
            from: 'products',
            localField: 'productId',
            foreignField: '_id',
            as: 'product'
          }
        },
        { $unwind: '$product' },
        {
          $match: { 'product.companyId': companyId }
        },
        {
          $group: {
            _id: null,
            totalCost: { $sum: { $multiply: ['$cost', 5] } }, // Rough estimate: 5 units per product
            avgMargin: { $avg: '$marginPercent' },
            avgMarginAmount: { $avg: '$marginAmount' },
            productsTracked: { $sum: 1 }
          }
        }
      ]);

      // Current inventory value
      const inventoryValue = await ProductVariation.aggregate([
        {
          $lookup: {
            from: 'products',
            localField: 'productId',
            foreignField: '_id',
            as: 'product'
          }
        },
        { $unwind: '$product' },
        {
          $match: { 'product.companyId': companyId }
        },
        {
          $group: {
            _id: null,
            totalUnitsInStock: { $sum: '$stockQty' },
            totalReserved: { $sum: '$reservedQty' },
            stockValue: { $sum: { $multiply: ['$stockQty', '$cost'] } }
          }
        }
      ]);

      const sales = salesAgg[0] || { totalUnits: 0, totalRevenue: 0, totalTransactions: 0 };
      const costs = costAgg[0] || { totalCost: 0, avgMargin: 0, productsTracked: 0 };
      const inventory = inventoryValue[0] || { totalUnitsInStock: 0, stockValue: 0 };

      const totalProfit = sales.totalRevenue - costs.totalCost;
      const profitMargin = sales.totalRevenue > 0 ? ((totalProfit / sales.totalRevenue) * 100).toFixed(2) : 0;

      return {
        companyId,
        period: { startDate, endDate },
        sales: {
          totalUnits: sales.totalUnits,
          totalRevenue: parseFloat(sales.totalRevenue.toFixed(2)),
          avgOrderValue: sales.totalTransactions > 0 ? parseFloat((sales.totalRevenue / sales.totalTransactions).toFixed(2)) : 0,
          transactions: sales.totalTransactions
        },
        inventory: {
          totalUnitsInStock: inventory.totalUnitsInStock,
          totalUnitsReserved: inventory.totalReserved,
          stockValue: parseFloat(inventory.stockValue.toFixed(2))
        },
        profitability: {
          totalProfit: parseFloat(totalProfit.toFixed(2)),
          profitMarginPercent: parseFloat(profitMargin),
          avgProductMargin: parseFloat((costs.avgMargin || 0).toFixed(2)),
          costOfGoods: parseFloat(costs.totalCost.toFixed(2))
        },
        metrics: {
          productsTracked: costs.productsTracked,
          roi: sales.totalRevenue > 0 ? parseFloat(((totalProfit / inventory.stockValue) * 100).toFixed(2)) : 0
        }
      };
    } catch (err) {
      logger.error('InventoryAnalyticsService.getCompanyMetrics failed:', err);
      throw err;
    }
  }

  /**
   * Get shop-level inventory metrics
   * @param {string} companyId
   * @param {string} shopId
   * @returns {object} - profit, margin, stock for specific shop
   */
  static async getShopMetrics(companyId, shopId, options = {}) {
    try {
      const { startDate, endDate } = options;
      const dateFilter = {};
      if (startDate) dateFilter.$gte = new Date(startDate);
      if (endDate) dateFilter.$lte = new Date(endDate);

      // Revenue from this shop
      const salesAgg = await StockChange.aggregate([
        {
          $match: {
            companyId,
            shopId,
            type: 'sale',
            ...(Object.keys(dateFilter).length && { createdAt: dateFilter })
          }
        },
        {
          $group: {
            _id: null,
            totalUnits: { $sum: { $abs: '$qty' } },
            totalRevenue: {
              $sum: { $multiply: [{ $abs: '$qty' }, { $ifNull: ['$meta.unitPrice', 0] }] }
            },
            transactions: { $sum: 1 }
          }
        }
      ]);

      // Margin by shop
      const marginAgg = await ProductPricing.aggregate([
        {
          $lookup: {
            from: 'products',
            localField: 'productId',
            foreignField: '_id',
            as: 'product'
          }
        },
        { $unwind: '$product' },
        {
          $match: { 'product.companyId': companyId, 'product.shopId': shopId }
        },
        {
          $group: {
            _id: null,
            avgMargin: { $avg: '$marginPercent' },
            avgMarginAmount: { $avg: '$marginAmount' },
            productsCount: { $sum: 1 }
          }
        }
      ]);

      // Inventory value
      const inventoryValue = await ProductVariation.aggregate([
        {
          $lookup: {
            from: 'products',
            localField: 'productId',
            foreignField: '_id',
            as: 'product'
          }
        },
        { $unwind: '$product' },
        {
          $match: { 'product.companyId': companyId, 'product.shopId': shopId }
        },
        {
          $group: {
            _id: null,
            totalUnits: { $sum: '$stockQty' },
            stockValue: { $sum: { $multiply: ['$stockQty', '$cost'] } }
          }
        }
      ]);

      const sales = salesAgg[0] || { totalUnits: 0, totalRevenue: 0, transactions: 0 };
      const margin = marginAgg[0] || { avgMargin: 0, productsCount: 0 };
      const inventory = inventoryValue[0] || { totalUnits: 0, stockValue: 0 };

      const totalCostOfSales = (sales.totalUnits * (margin.avgMarginAmount || 0));
      const totalProfit = sales.totalRevenue - totalCostOfSales;

      return {
        companyId,
        shopId,
        sales: {
          totalUnits: sales.totalUnits,
          totalRevenue: parseFloat(sales.totalRevenue.toFixed(2)),
          transactions: sales.transactions
        },
        inventory: {
          totalUnits: inventory.totalUnits,
          stockValue: parseFloat(inventory.stockValue.toFixed(2))
        },
        profitability: {
          totalProfit: parseFloat(totalProfit.toFixed(2)),
          avgMarginPercent: parseFloat((margin.avgMargin || 0).toFixed(2)),
          profitMarginPercent: sales.totalRevenue > 0 ? parseFloat(((totalProfit / sales.totalRevenue) * 100).toFixed(2)) : 0
        },
        productsTracked: margin.productsCount
      };
    } catch (err) {
      logger.error('InventoryAnalyticsService.getShopMetrics failed:', err);
      throw err;
    }
  }

  /**
   * Get product-level profit and margin analysis
   * @param {string} productId
   * @returns {object} - profit, margin, velocity, forecasts
   */
  static async getProductAnalytics(productId) {
    try {
      // Get product with pricing
      const product = await Product.findById(productId)
        .populate('pricingId')
        .lean();

      if (!product) throw new Error('Product not found');

      const pricing = product.pricingId || {};

      // Get stock record
      const stock = await ProductStock.findOne({ productId }).lean();

      // Get variants and their stock
      const variants = await ProductVariation.find({ productId }).lean();
      const totalCurrentStock = variants.reduce((sum, v) => sum + (v.stockQty || 0), 0);
      const totalReserved = variants.reduce((sum, v) => sum + (v.reservedQty || 0), 0);

      // Get sales history (last 90 days)
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const salesHistory = await StockChange.aggregate([
        {
          $match: {
            productId: new (require('mongoose')).Types.ObjectId(productId),
            type: 'sale',
            createdAt: { $gte: ninetyDaysAgo }
          }
        },
        {
          $group: {
            _id: null,
            totalUnits: { $sum: { $abs: '$qty' } },
            totalRevenue: {
              $sum: { $multiply: [{ $abs: '$qty' }, { $ifNull: ['$meta.unitPrice', pricing.basePrice || 0] }] }
            },
            transactions: { $sum: 1 }
          }
        }
      ]);

      const sales = salesHistory[0] || { totalUnits: 0, totalRevenue: 0, transactions: 0 };
      const unitsSold = sales.totalUnits;
      const totalRevenue = sales.totalRevenue;
      const totalCost = unitsSold * (pricing.cost || 0);
      const totalProfit = totalRevenue - totalCost;
      const avgMargin = pricing.marginPercent || 0;

      // Calculate stockout risk
      const avgDaily = unitsSold > 0 ? (unitsSold / 90).toFixed(2) : 0;
      const daysUntilStockout = avgDaily > 0 ? Math.ceil(totalCurrentStock / avgDaily) : 999;

      return {
        productId,
        name: product.name,
        sku: product.sku,
        profitability: {
          totalProfit: parseFloat(totalProfit.toFixed(2)),
          profitMarginPercent: totalRevenue > 0 ? parseFloat(((totalProfit / totalRevenue) * 100).toFixed(2)) : 0,
          marginPerUnit: parseFloat((pricing.marginAmount || 0).toFixed(2)),
          basePrice: pricing.basePrice || 0,
          cost: pricing.cost || 0
        },
        sales: {
          unitsLast90Days: unitsSold,
          revenueLast90Days: parseFloat(totalRevenue.toFixed(2)),
          avgDailySalesRate: parseFloat(avgDaily),
          transactions: sales.transactions
        },
        inventory: {
          currentStock: totalCurrentStock,
          reserved: totalReserved,
          available: Math.max(0, totalCurrentStock - totalReserved),
          variants: variants.length,
          lowStockThreshold: stock?.lowStockThreshold || 10,
          isLowStock: totalCurrentStock <= (stock?.lowStockThreshold || 10),
          daysOfInventory: daysUntilStockout
        },
        forecast: {
          stockoutRiskDays: Math.max(0, daysUntilStockout),
          suggestedReorderQty: stock?.suggestedReorderQty || (stock?.minReorderQty || 20) * 3,
          supplierLeadDays: stock?.supplierLeadDays || 7
        }
      };
    } catch (err) {
      logger.error('InventoryAnalyticsService.getProductAnalytics failed:', err);
      throw err;
    }
  }

  /**
   * Get top products by profit
   * @param {string} companyId
   * @param {number} limit
   * @returns {array} - products ranked by profit
   */
  static async getTopProductsByProfit(companyId, limit = 20) {
    try {
      const topProducts = await ProductPricing.aggregate([
        {
          $lookup: {
            from: 'products',
            localField: 'productId',
            foreignField: '_id',
            as: 'product'
          }
        },
        { $unwind: '$product' },
        {
          $match: { 'product.companyId': companyId }
        },
        {
          $project: {
            productId: 1,
            productName: '$product.name',
            basePrice: 1,
            cost: 1,
            marginAmount: 1,
            marginPercent: 1,
            unitsSoldLastMonth: 1,
            profit: { $multiply: ['$marginAmount', '$unitsSoldLastMonth'] }
          }
        },
        { $sort: { profit: -1 } },
        { $limit: limit }
      ]);

      return topProducts.map(p => ({
        productId: p.productId,
        name: p.productName,
        profit: parseFloat(p.profit.toFixed(2)),
        marginPercent: parseFloat(p.marginPercent.toFixed(2)),
        unitsSold: p.unitsSoldLastMonth,
        basePrice: p.basePrice,
        cost: p.cost
      }));
    } catch (err) {
      logger.error('InventoryAnalyticsService.getTopProductsByProfit failed:', err);
      throw err;
    }
  }

  /**
   * Get low stock alerts
   * @param {string} companyId
   * @param {string} shopId - optional
   * @returns {array} - products at risk of stockout
   */
  static async getLowStockProducts(companyId, shopId = null) {
    try {
      const match = { companyId, isDeleted: false };
      if (shopId) match.shopId = shopId;

      const lowStockProducts = await Product.aggregate([
        { $match: match },
        {
          $lookup: {
            from: 'productstocks',
            localField: '_id',
            foreignField: 'productId',
            as: 'stock'
          }
        },
        { $unwind: { path: '$stock', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'productvariations',
            localField: '_id',
            foreignField: 'productId',
            as: 'variants'
          }
        },
        {
          $project: {
            name: 1,
            sku: 1,
            totalStock: { $sum: '$variants.stockQty' },
            lowStockThreshold: { $ifNull: ['$stock.lowStockThreshold', 10] },
            avgDailySales: { $ifNull: ['$stock.avgDailySales', 0] },
            daysUntilStockout: {
              $cond: [
                { $gt: ['$stock.avgDailySales', 0] },
                { $ceil: { $divide: ['$totalStock', '$stock.avgDailySales'] } },
                999
              ]
            }
          }
        },
        {
          $match: {
            $expr: { $lte: ['$totalStock', '$lowStockThreshold'] }
          }
        },
        { $sort: { totalStock: 1 } }
      ]);

      return lowStockProducts;
    } catch (err) {
      logger.error('InventoryAnalyticsService.getLowStockProducts failed:', err);
      throw err;
    }
  }

  /**
   * Get stockout risk products
   * @param {string} companyId
   * @returns {array} - products likely to stockout soon
   */
  static async getStockoutRiskProducts(companyId) {
    try {
      const riskProducts = await ProductStock.aggregate([
        {
          $lookup: {
            from: 'products',
            localField: 'productId',
            foreignField: '_id',
            as: 'product'
          }
        },
        { $unwind: '$product' },
        {
          $match: { 'product.companyId': companyId }
        },
        {
          $project: {
            productId: 1,
            productName: '$product.name',
            sku: '$product.sku',
            avgDailySales: 1,
            stockoutRiskDays: 1,
            suggestedReorderQty: 1,
            supplierLeadDays: 1,
            isAtRisk: { $lte: ['$stockoutRiskDays', '$supplierLeadDays'] }
          }
        },
        {
          $match: { isAtRisk: true }
        },
        { $sort: { stockoutRiskDays: 1 } }
      ]);

      return riskProducts;
    } catch (err) {
      logger.error('InventoryAnalyticsService.getStockoutRiskProducts failed:', err);
      throw err;
    }
  }
}

module.exports = InventoryAnalyticsService;
