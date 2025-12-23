"use strict";

const sequelize = require("../config/db");
const { Op } = require("sequelize");
const Sale = require("../models/Sales.model");
const SalesItem = require("../models/SalesItem.model");
const KnownUser = require("../models/KnownUser.model");

/**
 * Comprehensive Reporting Service for Sales Analytics
 * Provides rich analytics with revenue, product, salesperson, and shop metrics
 */
class ReportsService {
  /**
   * Calculate revenue for a specific date range
   */
  static async calculateRevenue(companyId, shopId = null, startDate, endDate, options = {}) {
    // Normalize parameter types: companyId is UUID (string) in our model, so keep as string
    let normalizedCompanyId = companyId;
    if (typeof companyId === 'string') normalizedCompanyId = companyId.trim();

    let normalizedShopId = shopId;
    if (typeof shopId === 'string') normalizedShopId = shopId.trim();

    // Normalize dates to full-day boundaries to avoid timezone partial-day issues
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Payment status: allow override via options.paymentStatus; default to 'paid'
    const paymentStatusOption = options && options.paymentStatus !== undefined ? options.paymentStatus : 'paid';

    const whereClause = {
      createdAt: { [Op.between]: [start, end] },
    };

    if (normalizedCompanyId) whereClause.companyId = normalizedCompanyId;
    if (normalizedShopId) whereClause.shopId = normalizedShopId;
    if (paymentStatusOption && paymentStatusOption !== 'all') whereClause.paymentStatus = paymentStatusOption;

    const result = await Sale.findAll({
      attributes: [
        [sequelize.fn("SUM", sequelize.col("totalAmount")), "totalRevenue"],
        [sequelize.fn("COUNT", sequelize.col("saleId")), "totalTransactions"],
        [
          sequelize.fn("AVG", sequelize.col("totalAmount")),
          "averageTransactionValue",
        ],
        [
          sequelize.fn("SUM", sequelize.col("subTotal")),
          "totalSubTotal",
        ],
        [sequelize.fn("SUM", sequelize.col("discountTotal")), "totalDiscount"],
        [sequelize.fn("SUM", sequelize.col("taxTotal")), "totalTax"],
      ],
      where: whereClause,
      raw: true,
    });

    // Normalize SQL aggregate NULLs to numeric zeros and ensure numeric types
    const row = result[0] || {};
    const toNumber = (v) => {
      if (v === null || v === undefined) return 0;
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    const metrics = {
      totalRevenue: toNumber(row.totalRevenue),
      totalTransactions: toNumber(row.totalTransactions),
      averageTransactionValue: toNumber(row.averageTransactionValue),
      totalSubTotal: toNumber(row.totalSubTotal),
      totalDiscount: toNumber(row.totalDiscount),
      totalTax: toNumber(row.totalTax),
    };

    // If debug option is enabled, include extra info to help troubleshoot
    if (options && options.debug) {
      const count = await Sale.count({ where: whereClause });
      const sample = await Sale.findOne({ where: whereClause, order: [["createdAt", "DESC"]], raw: true });
      // Also calculate matching rows without paymentStatus to check whether the paymentStatus filter is excluding results
      const whereNoPayment = { ...whereClause };
      delete whereNoPayment.paymentStatus;
      const countWithoutPaymentStatus = await Sale.count({ where: whereNoPayment });

      return {
        ...metrics,
        _debug: {
          where: whereClause,
          matchingRows: count,
          matchingRowsWithoutPaymentStatus: countWithoutPaymentStatus,
          sampleRow: sample,
        },
      };
    }

    return metrics;
  }

  /**
   * Get top performing products by revenue
   */
  static async getTopProducts(companyId, shopId = null, startDate, endDate, limit = 10) {
    const whereClause = {
      "$sale.companyId$": companyId,
      "$sale.paymentStatus$": "paid",
      "$sale.createdAt$": { [Op.between]: [startDate, endDate] },
    };

    if (shopId) whereClause["$sale.shopId$"] = shopId;

    const products = await SalesItem.findAll({
      attributes: [
        "productId",
        "productName",
        "category",
        [sequelize.fn("SUM", sequelize.col("quantity")), "totalQuantitySold"],
        [sequelize.fn("SUM", sequelize.col("total")), "totalRevenue"],
        [sequelize.fn("COUNT", sequelize.col("saleItemId")), "transactionCount"],
        [sequelize.fn("AVG", sequelize.col("unitPrice")), "averageUnitPrice"],
        [
          sequelize.fn("SUM", sequelize.literal("quantity * unitPrice")),
          "grossRevenue",
        ],
      ],
      include: [
        {
          model: Sale,
          as: "sale",
          attributes: [],
          required: true,
          where: whereClause,
        },
      ],
      group: [sequelize.col("SalesItem.productId"), sequelize.col("SalesItem.productName"), sequelize.col("SalesItem.category")],
      order: [[sequelize.literal("totalRevenue"), "DESC"]],
      limit,
      subQuery: false,
      raw: true,
    });

    return products;
  }

  /**
   * Get products by performance tier (top, moderate, low)
   */
  static async getProductsByPerformanceTier(companyId, shopId = null, startDate, endDate) {
    const whereClause = {
      "$sale.companyId$": companyId,
      "$sale.paymentStatus$": "paid",
      "$sale.createdAt$": { [Op.between]: [startDate, endDate] },
    };

    if (shopId) whereClause["$sale.shopId$"] = shopId;

    const products = await SalesItem.findAll({
      attributes: [
        "productId",
        "productName",
        "category",
        [sequelize.fn("SUM", sequelize.col("quantity")), "totalQuantitySold"],
        [sequelize.fn("SUM", sequelize.col("total")), "totalRevenue"],
        [sequelize.fn("AVG", sequelize.col("unitPrice")), "averagePrice"],
      ],
      include: [
        {
          model: Sale,
          as: "sale",
          attributes: [],
          required: true,
          where: whereClause,
        },
      ],
      group: [sequelize.col("SalesItem.productId"), sequelize.col("SalesItem.productName"), sequelize.col("SalesItem.category")],
      order: [[sequelize.literal("totalRevenue"), "DESC"]],
      subQuery: false,
      raw: true,
    });

    // Calculate percentiles to determine tiers
    if (products.length === 0) return { top: [], moderate: [], low: [] };

    const revenues = products.map((p) => parseFloat(p.totalRevenue));
    const p75 = this.getPercentile(revenues, 0.75);
    const p25 = this.getPercentile(revenues, 0.25);

    return {
      top: products.filter((p) => parseFloat(p.totalRevenue) >= p75),
      moderate: products.filter(
        (p) =>
          parseFloat(p.totalRevenue) >= p25 &&
          parseFloat(p.totalRevenue) < p75
      ),
      low: products.filter((p) => parseFloat(p.totalRevenue) < p25),
    };
  }

  /**
   * Get sales by salesperson with detailed metrics
   */
  static async getSalesPersonMetrics(companyId, shopId = null, startDate, endDate) {
    const whereClause = {
      companyId,
      paymentStatus: "paid",
      createdAt: { [Op.between]: [startDate, endDate] },
    };

    if (shopId) whereClause.shopId = shopId;

    const salespeople = await Sale.findAll({
      attributes: [
        "soldBy",
        [sequelize.fn("COUNT", sequelize.col("saleId")), "totalSales"],
        [sequelize.fn("SUM", sequelize.col("totalAmount")), "totalRevenue"],
        [
          sequelize.fn("AVG", sequelize.col("totalAmount")),
          "averageSaleValue",
        ],
        [
          sequelize.fn("SUM", sequelize.col("subTotal")),
          "grossRevenue",
        ],
        [sequelize.fn("SUM", sequelize.col("discountTotal")), "totalDiscount"],
      ],
      where: whereClause,
      group: ["soldBy"],
      order: [[sequelize.literal("totalRevenue"), "DESC"]],
      raw: true,
    });

    return salespeople;
  }

  /**
   * Get salespeople by performance tier
   */
  static async getSalesPersonPerformanceTier(companyId, shopId = null, startDate, endDate) {
    const salespeople = await this.getSalesPersonMetrics(companyId, shopId, startDate, endDate);

    if (salespeople.length === 0) return { top: [], moderate: [], low: [] };

    const revenues = salespeople.map((s) => parseFloat(s.totalRevenue));
    const p75 = this.getPercentile(revenues, 0.75);
    const p25 = this.getPercentile(revenues, 0.25);

    return {
      top: salespeople.filter((s) => parseFloat(s.totalRevenue) >= p75),
      moderate: salespeople.filter(
        (s) =>
          parseFloat(s.totalRevenue) >= p25 &&
          parseFloat(s.totalRevenue) < p75
      ),
      low: salespeople.filter((s) => parseFloat(s.totalRevenue) < p25),
    };
  }

  /**
   * Get shop-level analytics
   */
  static async getShopAnalytics(companyId, startDate, endDate) {
    const whereClause = {
      companyId,
      paymentStatus: "paid",
      createdAt: { [Op.between]: [startDate, endDate] },
    };

    const shops = await Sale.findAll({
      attributes: [
        "shopId",
        [sequelize.fn("COUNT", sequelize.col("saleId")), "totalSales"],
        [sequelize.fn("SUM", sequelize.col("totalAmount")), "totalRevenue"],
        [
          sequelize.fn("AVG", sequelize.col("totalAmount")),
          "averageSaleValue",
        ],
        [sequelize.fn("COUNT", sequelize.fn("DISTINCT", sequelize.col("knownUserId"))), "uniqueCustomers"],
      ],
      where: whereClause,
      group: ["shopId"],
      order: [[sequelize.literal("totalRevenue"), "DESC"]],
      raw: true,
    });

    return shops;
  }

  /**
   * Get shops by performance tier
   */
  static async getShopPerformanceTier(companyId, startDate, endDate) {
    const shops = await this.getShopAnalytics(companyId, startDate, endDate);

    if (shops.length === 0) return { top: [], moderate: [], low: [] };

    const revenues = shops.map((s) => parseFloat(s.totalRevenue));
    const p75 = this.getPercentile(revenues, 0.75);
    const p25 = this.getPercentile(revenues, 0.25);

    return {
      top: shops.filter((s) => parseFloat(s.totalRevenue) >= p75),
      moderate: shops.filter(
        (s) =>
          parseFloat(s.totalRevenue) >= p25 &&
          parseFloat(s.totalRevenue) < p75
      ),
      low: shops.filter((s) => parseFloat(s.totalRevenue) < p25),
    };
  }

  /**
   * Get sales trends over time (daily, weekly, monthly)
   */
  static async getSalesTrend(companyId, shopId = null, startDate, endDate, granularity = "daily") {
    const whereClause = {
      companyId,
      paymentStatus: "paid",
      createdAt: { [Op.between]: [startDate, endDate] },
    };

    if (shopId) whereClause.shopId = shopId;

    let dateFormat;
    switch (granularity) {
      case "weekly":
        dateFormat = "%Y-W%v";
        break;
      case "monthly":
        dateFormat = "%Y-%m";
        break;
      case "daily":
      default:
        dateFormat = "%Y-%m-%d";
    }

    const trends = await Sale.findAll({
      attributes: [
        [sequelize.fn("DATE_FORMAT", sequelize.col("createdAt"), sequelize.literal(`'${dateFormat}'`)), "period"],
        [sequelize.fn("COUNT", sequelize.col("saleId")), "transactionCount"],
        [sequelize.fn("SUM", sequelize.col("totalAmount")), "revenue"],
        [sequelize.fn("AVG", sequelize.col("totalAmount")), "averageValue"],
      ],
      where: whereClause,
      group: [sequelize.fn("DATE_FORMAT", sequelize.col("createdAt"), sequelize.literal(`'${dateFormat}'`))],
      order: [[sequelize.literal("period"), "ASC"]],
      raw: true,
    });

    return trends;
  }

  /**
   * Compare revenue between two periods
   */
  static async compareRevenuePeriods(companyId, shopId = null, period1Start, period1End, period2Start, period2End) {
    const period1 = await this.calculateRevenue(companyId, shopId, period1Start, period1End);
    const period2 = await this.calculateRevenue(companyId, shopId, period2Start, period2End);

    const revenueChange = parseFloat(period1.totalRevenue) - parseFloat(period2.totalRevenue);
    const percentageChange = period2.totalRevenue > 0
      ? ((revenueChange / parseFloat(period2.totalRevenue)) * 100).toFixed(2)
      : 0;

    return {
      period1: {
        startDate: period1Start,
        endDate: period1End,
        ...period1,
      },
      period2: {
        startDate: period2Start,
        endDate: period2End,
        ...period2,
      },
      comparison: {
        revenueChange,
        percentageChange: parseFloat(percentageChange),
        trend: revenueChange > 0 ? "up" : revenueChange < 0 ? "down" : "stable",
      },
    };
  }

  /**
   * Get salesperson detailed report
   */
  static async getSalesPersonReport(companyId, soldBy, shopId = null, startDate, endDate) {
    const whereClause = {
      companyId,
      soldBy,
      paymentStatus: "paid",
      createdAt: { [Op.between]: [startDate, endDate] },
    };

    if (shopId) whereClause.shopId = shopId;

    // Summary metrics
    const summary = await Sale.findAll({
      attributes: [
        [sequelize.fn("COUNT", sequelize.col("saleId")), "totalSales"],
        [sequelize.fn("SUM", sequelize.col("totalAmount")), "totalRevenue"],
        [sequelize.fn("AVG", sequelize.col("totalAmount")), "averageSaleValue"],
        [sequelize.fn("COUNT", sequelize.fn("DISTINCT", sequelize.col("knownUserId"))), "uniqueCustomers"],
      ],
      where: whereClause,
      raw: true,
    });

    // Products sold by this salesperson
    const topProducts = await SalesItem.findAll({
      attributes: [
        "productId",
        "productName",
        [sequelize.fn("SUM", sequelize.col("quantity")), "quantitySold"],
        [sequelize.fn("SUM", sequelize.col("total")), "revenue"],
      ],
      include: [
        {
          model: Sale,
          as: "sale",
          attributes: [],
          required: true,
          where: whereClause,
        },
      ],
      group: [sequelize.col("SalesItem.productId"), sequelize.col("SalesItem.productName")],
      order: [[sequelize.literal("revenue"), "DESC"]],
      limit: 10,
      subQuery: false,
      raw: true,
    });

    // Sales timeline
    const timeline = await Sale.findAll({
      attributes: [
        "saleId",
        "totalAmount",
        "paymentMethod",
        [sequelize.fn("DATE", sequelize.col("createdAt")), "saleDate"],
      ],
      where: whereClause,
      order: [["createdAt", "DESC"]],
      limit: 50,
      raw: true,
    });

    return {
      salesperson: soldBy,
      summary: summary[0] || {},
      topProducts,
      recentSales: timeline,
    };
  }

  /**
   * Get comprehensive company sales report
   */
  static async getCompanySalesReport(companyId, startDate, endDate) {
    const whereClause = {
      companyId,
      paymentStatus: "paid",
      createdAt: { [Op.between]: [startDate, endDate] },
    };

    // Overall revenue
    const revenue = await this.calculateRevenue(companyId, null, startDate, endDate);

    // Top products
    const topProducts = await this.getTopProducts(companyId, null, startDate, endDate, 5);

    // Top salespeople
    const topSalespeople = await Sale.findAll({
      attributes: [
        "soldBy",
        [sequelize.fn("COUNT", sequelize.col("saleId")), "sales"],
        [sequelize.fn("SUM", sequelize.col("totalAmount")), "revenue"],
      ],
      where: whereClause,
      group: ["soldBy"],
      order: [[sequelize.literal("revenue"), "DESC"]],
      limit: 5,
      raw: true,
    });

    // Shop performance
    const shopPerformance = await this.getShopAnalytics(companyId, startDate, endDate);

    // Payment method breakdown
    const paymentBreakdown = await Sale.findAll({
      attributes: [
        "paymentMethod",
        [sequelize.fn("COUNT", sequelize.col("saleId")), "count"],
        [sequelize.fn("SUM", sequelize.col("totalAmount")), "amount"],
      ],
      where: whereClause,
      group: ["paymentMethod"],
      raw: true,
    });

    // Sale type breakdown
    const saleTypeBreakdown = await Sale.findAll({
      attributes: [
        "saleType",
        [sequelize.fn("COUNT", sequelize.col("saleId")), "count"],
        [sequelize.fn("SUM", sequelize.col("totalAmount")), "amount"],
      ],
      where: whereClause,
      group: ["saleType"],
      raw: true,
    });

    return {
      period: { startDate, endDate },
      revenue,
      topProducts,
      topSalespeople,
      shopPerformance,
      paymentMethodBreakdown: paymentBreakdown,
      saleTypeBreakdown,
    };
  }

  /**
   * Get customer purchase history and analytics
   */
  static async getCustomerAnalytics(companyId, knownUserId, shopId = null) {
    const whereClause = {
      companyId,
      knownUserId,
    };

    if (shopId) whereClause.shopId = shopId;

    const customer = await KnownUser.findByPk(knownUserId);

    if (!customer) {
      throw new Error("Customer not found");
    }

    // Customer purchase summary
    const summary = await Sale.findAll({
      attributes: [
        [sequelize.fn("COUNT", sequelize.col("saleId")), "totalPurchases"],
        [sequelize.fn("SUM", sequelize.col("totalAmount")), "totalSpent"],
        [sequelize.fn("AVG", sequelize.col("totalAmount")), "averagePurchaseValue"],
        [sequelize.fn("MAX", sequelize.col("createdAt")), "lastPurchaseDate"],
      ],
      where: whereClause,
      raw: true,
    });

    // Products purchased
    const purchasedProducts = await SalesItem.findAll({
      attributes: [
        "productId",
        "productName",
        [sequelize.fn("SUM", sequelize.col("quantity")), "quantityPurchased"],
        [sequelize.fn("COUNT", sequelize.col("saleItemId")), "purchaseCount"],
        [sequelize.fn("SUM", sequelize.col("total")), "totalAmount"],
      ],
      include: [
        {
          model: Sale,
          as: "sale",
          attributes: [],
          required: true,
          where: whereClause,
        },
      ],
      group: [sequelize.col("SalesItem.productId"), sequelize.col("SalesItem.productName")],
      order: [[sequelize.literal("totalAmount"), "DESC"]],
      subQuery: false,
      raw: true,
    });

    // Purchase timeline
    const timeline = await Sale.findAll({
      attributes: ["saleId", "totalAmount", "paymentMethod", "createdAt"],
      where: whereClause,
      order: [["createdAt", "DESC"]],
      limit: 20,
      raw: true,
    });

    return {
      customer: {
        knownUserId: customer.knownUserId,
        name: customer.customerName,
        phone: customer.customerPhone,
        email: customer.customerEmail,
        address: customer.customerAddress,
      },
      summary: summary[0] || {},
      purchasedProducts,
      recentPurchases: timeline,
    };
  }

  /**
   * Get category performance report
   */
  static async getCategoryReport(companyId, shopId = null, startDate, endDate) {
    const whereClause = {
      "$sale.companyId$": companyId,
      "$sale.paymentStatus$": "paid",
      "$sale.createdAt$": { [Op.between]: [startDate, endDate] },
    };

    if (shopId) whereClause["$sale.shopId$"] = shopId;

    const categories = await SalesItem.findAll({
      attributes: [
        "category",
        [sequelize.fn("COUNT", sequelize.col("saleItemId")), "itemsCount"],
        [sequelize.fn("SUM", sequelize.col("quantity")), "totalQuantity"],
        [sequelize.fn("SUM", sequelize.col("total")), "totalRevenue"],
        [sequelize.fn("AVG", sequelize.col("unitPrice")), "averagePrice"],
      ],
      include: [
        {
          model: Sale,
          as: "sale",
          attributes: [],
          required: true,
          where: whereClause,
        },
      ],
      group: [sequelize.col("SalesItem.category")],
      order: [[sequelize.literal("totalRevenue"), "DESC"]],
      subQuery: false,
      raw: true,
    });

    return categories;
  }

  /**
   * Get payment method analytics
   */
  static async getPaymentMethodAnalytics(companyId, shopId = null, startDate, endDate) {
    const whereClause = {
      companyId,
      paymentStatus: "paid",
      createdAt: { [Op.between]: [startDate, endDate] },
    };

    if (shopId) whereClause.shopId = shopId;

    const methods = await Sale.findAll({
      attributes: [
        "paymentMethod",
        [sequelize.fn("COUNT", sequelize.col("saleId")), "transactionCount"],
        [sequelize.fn("SUM", sequelize.col("totalAmount")), "totalAmount"],
        [sequelize.fn("AVG", sequelize.col("totalAmount")), "averageAmount"],
      ],
      where: whereClause,
      group: ["paymentMethod"],
      order: [[sequelize.literal("totalAmount"), "DESC"]],
      raw: true,
    });

    return methods;
  }

  /**
   * Helper: Calculate percentile
   */
  static getPercentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = arr.sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }
}

module.exports = ReportsService;
