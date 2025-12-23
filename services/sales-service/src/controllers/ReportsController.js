const ReportsService = require("../services/reports.service");
const logger = require("../utils/logger");
const sequelize = require("../config/db");
const { Op } = require("sequelize");
const Sale = require("../models/Sales.model");

/**
 * Helper function to extract parameters from request (body, query, or params)
 */
const getParams = (req, ...keys) => {
  const params = {};
  const sources = [req.body || {}, req.query || {}, req.params || {}];
  
  for (const key of keys) {
    for (const source of sources) {
      if (source[key] !== undefined) {
        params[key] = source[key];
        break;
      }
    }
  }
  
  return params;
};

/**
 * Reports Controller - Rich and comprehensive sales analytics
 */
class ReportsController {
  /**
   * General Sales Report with all key metrics
   * GET /reports/sales
   * Query params: companyId, shopId (optional), startDate, endDate
   */
  static async generalSalesReport(req, res) {
    try {
      const { companyId, shopId, startDate, endDate } = getParams(req, "companyId", "shopId", "startDate", "endDate");

      if (!companyId || !startDate || !endDate) {
        return res.status(400).json({
          message: "Missing required parameters: companyId, startDate, endDate",
        });
      }

      const report = await ReportsService.getCompanySalesReport(
        companyId,
        new Date(startDate),
        new Date(endDate)
      );

      return res.status(200).json({
        success: true,
        data: report,
      });
    } catch (error) {
      logger.error("Error generating general sales report:", error);
      return res.status(500).json({
        message: "Error generating sales report",
        error: error?.message || "Unknown error",
      });
    }
  }

  /**
   * Product Performance Report with tier breakdown
   * GET /reports/products/performance
   * Query params: companyId, shopId (optional), startDate, endDate
   */
  static async productPerformanceReport(req, res) {
    try {
      const { companyId, shopId, startDate, endDate } = getParams(req, "companyId", "shopId", "startDate", "endDate");

      if (!companyId || !startDate || !endDate) {
        return res.status(400).json({
          message: "Missing required parameters: companyId, startDate, endDate",
        });
      }

      const tiers = await ReportsService.getProductsByPerformanceTier(
        companyId,
        shopId,
        new Date(startDate),
        new Date(endDate)
      );

      const topProducts = await ReportsService.getTopProducts(
        companyId,
        shopId,
        new Date(startDate),
        new Date(endDate),
        20
      );

      return res.status(200).json({
        success: true,
        data: {
          performanceTiers: tiers,
          topProducts,
        },
      });
    } catch (error) {
      logger.error("Error generating product performance report:", error);
      return res.status(500).json({
        message: "Error generating product performance report",
        error: error?.message || "Unknown error",
      });
    }
  }

  /**
   * Top Selling Products
   * GET /reports/products/top
   * Query params: companyId, shopId (optional), startDate, endDate, limit
   */
  static async topSellingProducts(req, res) {
    try {
      const params = getParams(req, "companyId", "shopId", "startDate", "endDate", "limit");
      const { companyId, shopId, startDate, endDate, limit = 10 } = params;

      if (!companyId || !startDate || !endDate) {
        return res.status(400).json({
          message: "Missing required parameters: companyId, startDate, endDate",
        });
      }

      const products = await ReportsService.getTopProducts(
        companyId,
        shopId,
        new Date(startDate),
        new Date(endDate),
        parseInt(limit)
      );

      return res.status(200).json({
        success: true,
        data: products,
      });
    } catch (error) {
      logger.error("Error fetching top selling products:", error);
      return res.status(500).json({
        message: "Error fetching top selling products",
        error: error?.message || "Unknown error",
      });
    }
  }

  /**
   * Category Performance Report
   * GET /reports/categories
   * Query params: companyId, shopId (optional), startDate, endDate
   */
  static async categoryReport(req, res) {
    try {
      const { companyId, shopId, startDate, endDate } = getParams(req, "companyId", "shopId", "startDate", "endDate");

      if (!companyId || !startDate || !endDate) {
        return res.status(400).json({
          message: "Missing required parameters: companyId, startDate, endDate",
        });
      }

      const categories = await ReportsService.getCategoryReport(
        companyId,
        shopId,
        new Date(startDate),
        new Date(endDate)
      );

      return res.status(200).json({
        success: true,
        data: categories,
      });
    } catch (error) {
      logger.error("Error generating category report:", error);
      return res.status(500).json({
        message: "Error generating category report",
        error: error?.message || "Unknown error",
      });
    }
  }

  /**
   * Salesperson Performance Report with tier breakdown
   * GET /reports/salespeople/performance
   * Query params: companyId, shopId (optional), startDate, endDate
   */
  static async salesPersonPerformanceReport(req, res) {
    try {
      const { companyId, shopId, startDate, endDate } = getParams(req, "companyId", "shopId", "startDate", "endDate");

      if (!companyId || !startDate || !endDate) {
        return res.status(400).json({
          message: "Missing required parameters: companyId, startDate, endDate",
        });
      }

      const tiers = await ReportsService.getSalesPersonPerformanceTier(
        companyId,
        shopId,
        new Date(startDate),
        new Date(endDate)
      );

      const allMetrics = await ReportsService.getSalesPersonMetrics(
        companyId,
        shopId,
        new Date(startDate),
        new Date(endDate)
      );

      return res.status(200).json({
        success: true,
        data: {
          performanceTiers: tiers,
          allSalespeople: allMetrics,
        },
      });
    } catch (error) {
      logger.error("Error generating salesperson performance report:", error);
      return res.status(500).json({
        message: "Error generating salesperson performance report",
        error: error?.message || "Unknown error",
      });
    }
  }

  /**
   * Detailed Salesperson Report
   * GET /reports/salespeople/:soldBy
   * Query params: companyId, shopId (optional), startDate, endDate
   */
  static async salesPersonDetailedReport(req, res) {
    try {
      const { soldBy } = req.params;
      const { companyId, shopId, startDate, endDate } = getParams(req, "companyId", "shopId", "startDate", "endDate");

      if (!companyId || !startDate || !endDate) {
        return res.status(400).json({
          message: "Missing required parameters: companyId, startDate, endDate",
        });
      }

      const report = await ReportsService.getSalesPersonReport(
        companyId,
        soldBy,
        shopId,
        new Date(startDate),
        new Date(endDate)
      );

      return res.status(200).json({
        success: true,
        data: report,
      });
    } catch (error) {
      logger.error("Error generating salesperson detailed report:", error);
      return res.status(500).json({
        message: "Error generating salesperson detailed report",
        error: error?.message || "Unknown error",
      });
    }
  }

  /**
   * Salesperson Sales Trend
   * GET /reports/salespeople/:soldBy/trends
   * Query params: companyId, shopId (optional), startDate, endDate, granularity (daily|weekly|monthly)
   */
  static async salesPersonTrend(req, res) {
    try {
      const params = getParams(req, "soldBy", "companyId", "shopId", "startDate", "endDate", "granularity");
      const { soldBy, companyId, shopId, startDate, endDate, granularity = "daily" } = params;

      if (!companyId || !startDate || !endDate) {
        return res.status(400).json({
          message: "Missing required parameters: companyId, startDate, endDate",
        });
      }

      // Get sales trend for this person
      const trends = await ReportsService.getSalesTrend(
        companyId,
        shopId,
        new Date(startDate),
        new Date(endDate),
        granularity
      );

      // Filter for just this salesperson
      const whereClause = {
        companyId,
        soldBy,
        paymentStatus: "paid",
        createdAt: { [Op.between]: [new Date(startDate), new Date(endDate)] },
      };

      if (shopId) whereClause.shopId = shopId;

      const personTrends = await Sale.findAll({
        attributes: [
          [sequelize.fn("DATE_FORMAT", sequelize.col("createdAt"), sequelize.literal("'%Y-%m-%d'")), "period"],
          [sequelize.fn("COUNT", sequelize.col("saleId")), "transactionCount"],
          [sequelize.fn("SUM", sequelize.col("totalAmount")), "revenue"],
        ],
        where: whereClause,
        group: [sequelize.fn("DATE_FORMAT", sequelize.col("createdAt"), sequelize.literal("'%Y-%m-%d'"))],
        order: [[sequelize.literal("period"), "ASC"]],
        raw: true,
      });

      return res.status(200).json({
        success: true,
        data: {
          salesperson: soldBy,
          trends: personTrends,
        },
      });
    } catch (error) {
      logger.error("Error generating salesperson trend report:", error);
      return res.status(500).json({
        message: "Error generating salesperson trend report",
        error: error?.message || "Unknown error",
      });
    }
  }

  /**
   * Shop Performance Report with tier breakdown
   * GET /reports/shops/performance
   * Query params: companyId, startDate, endDate
   */
  static async shopPerformanceReport(req, res) {
    try {
      const { companyId, startDate, endDate } = getParams(req, "companyId", "startDate", "endDate");

      if (!companyId || !startDate || !endDate) {
        return res.status(400).json({
          message: "Missing required parameters: companyId, startDate, endDate",
        });
      }

      const tiers = await ReportsService.getShopPerformanceTier(
        companyId,
        new Date(startDate),
        new Date(endDate)
      );

      const allShops = await ReportsService.getShopAnalytics(
        companyId,
        new Date(startDate),
        new Date(endDate)
      );

      return res.status(200).json({
        success: true,
        data: {
          performanceTiers: tiers,
          allShops,
        },
      });
    } catch (error) {
      logger.error("Error generating shop performance report:", error);
      return res.status(500).json({
        message: "Error generating shop performance report",
        error: error?.message || "Unknown error",
      });
    }
  }

  /**
   * Shop Detailed Analytics
   * GET /reports/shops/:shopId
   * Query params: companyId, startDate, endDate
   */
  static async shopDetailedReport(req, res) {
    try {
      const { shopId, companyId, startDate, endDate, debug } = getParams(req, "shopId", "companyId", "startDate", "endDate", "debug");

      if (!companyId || !startDate || !endDate) {
        return res.status(400).json({
          message: "Missing required parameters: companyId, startDate, endDate",
        });
      }

      const revenue = await ReportsService.calculateRevenue(
        companyId,
        shopId,
        new Date(startDate),
        new Date(endDate),
        { debug: debug === true || debug === 'true' }
      );

      const topProducts = await ReportsService.getTopProducts(
        companyId,
        shopId,
        new Date(startDate),
        new Date(endDate),
        10
      );

      const topSalespeople = await ReportsService.getSalesPersonMetrics(
        companyId,
        shopId,
        new Date(startDate),
        new Date(endDate)
      );

      const trends = await ReportsService.getSalesTrend(
        companyId,
        shopId,
        new Date(startDate),
        new Date(endDate),
        "daily"
      );

      return res.status(200).json({
        success: true,
        data: {
          shopId,
          revenue,
          topProducts,
          topSalespeople,
          trends,
        },
      });
    } catch (error) {
      logger.error("Error generating shop detailed report:", error);
      return res.status(500).json({
        message: "Error generating shop detailed report",
        error: error?.message || "Unknown error",
      });
    }
  }

  /**
   * Revenue Trend Report with multiple granularities
   * GET /reports/revenue/trends
   * Query params: companyId, shopId (optional), startDate, endDate, granularity (daily|weekly|monthly)
   */
  static async revenueTrend(req, res) {
    try {
      const params = getParams(req, "companyId", "shopId", "startDate", "endDate", "granularity");
      const { companyId, shopId, startDate, endDate, granularity = "daily" } = params;

      if (!companyId || !startDate || !endDate) {
        return res.status(400).json({
          message: "Missing required parameters: companyId, startDate, endDate",
        });
      }

      const trends = await ReportsService.getSalesTrend(
        companyId,
        shopId,
        new Date(startDate),
        new Date(endDate),
        granularity
      );

      return res.status(200).json({
        success: true,
        data: {
          granularity,
          trends,
        },
      });
    } catch (error) {
      logger.error("Error generating revenue trend report:", error);
      return res.status(500).json({
        message: "Error generating revenue trend report",
        error: error?.message || "Unknown error",
      });
    }
  }

  /**
   * Period Comparison Report
   * GET /reports/comparison
   * Query params: companyId, shopId (optional), period1Start, period1End, period2Start, period2End
   */
  static async periodComparison(req, res) {
    try {
      const { companyId, shopId, period1Start, period1End, period2Start, period2End } = getParams(req, "companyId", "shopId", "period1Start", "period1End", "period2Start", "period2End");

      if (!companyId || !period1Start || !period1End || !period2Start || !period2End) {
        return res.status(400).json({
          message: "Missing required parameters: companyId, period1Start, period1End, period2Start, period2End",
        });
      }

      const comparison = await ReportsService.compareRevenuePeriods(
        companyId,
        shopId,
        new Date(period1Start),
        new Date(period1End),
        new Date(period2Start),
        new Date(period2End)
      );

      return res.status(200).json({
        success: true,
        data: comparison,
      });
    } catch (error) {
      logger.error("Error generating period comparison report:", error);
      return res.status(500).json({
        message: "Error generating period comparison report",
        error: error?.message || "Unknown error",
      });
    }
  }

  /**
   * Period Comparison - Current Month vs Last Month
   * GET /reports/comparison/month
   * Query params: companyId, shopId (optional)
   */
  static async monthComparison(req, res) {
    try {
      const { companyId, shopId } = getParams(req, "companyId", "shopId");

      if (!companyId) {
        return res.status(400).json({
          message: "Missing required parameter: companyId",
        });
      }

      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

      const comparison = await ReportsService.compareRevenuePeriods(
        companyId,
        shopId,
        currentMonthStart,
        currentMonthEnd,
        lastMonthStart,
        lastMonthEnd
      );

      return res.status(200).json({
        success: true,
        data: comparison,
      });
    } catch (error) {
      logger.error("Error generating month comparison report:", error);
      return res.status(500).json({
        message: "Error generating month comparison report",
        error: error?.message || "Unknown error",
      });
    }
  }

  /**
   * Period Comparison - Today vs Yesterday
   * GET /reports/comparison/day
   * Query params: companyId, shopId (optional)
   */
  static async dayComparison(req, res) {
    try {
      const { companyId, shopId } = getParams(req, "companyId", "shopId");

      if (!companyId) {
        return res.status(400).json({
          message: "Missing required parameter: companyId",
        });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayEnd = new Date(yesterday);
      yesterdayEnd.setHours(23, 59, 59, 999);

      const comparison = await ReportsService.compareRevenuePeriods(
        companyId,
        shopId,
        today,
        todayEnd,
        yesterday,
        yesterdayEnd
      );

      return res.status(200).json({
        success: true,
        data: comparison,
      });
    } catch (error) {
      logger.error("Error generating day comparison report:", error);
      return res.status(500).json({
        message: "Error generating day comparison report",
        error: error?.message || "Unknown error",
      });
    }
  }

  /**
   * Period Comparison - This Year vs Last Year
   * GET /reports/comparison/year
   * Query params: companyId, shopId (optional)
   */
  static async yearComparison(req, res) {
    try {
      const { companyId, shopId } = getParams(req, "companyId", "shopId");

      if (!companyId) {
        return res.status(400).json({
          message: "Missing required parameter: companyId",
        });
      }

      const now = new Date();
      const currentYearStart = new Date(now.getFullYear(), 0, 1);
      const currentYearEnd = new Date(now.getFullYear(), 11, 31);

      const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
      const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31);

      const comparison = await ReportsService.compareRevenuePeriods(
        companyId,
        shopId,
        currentYearStart,
        currentYearEnd,
        lastYearStart,
        lastYearEnd
      );

      return res.status(200).json({
        success: true,
        data: comparison,
      });
    } catch (error) {
      logger.error("Error generating year comparison report:", error);
      return res.status(500).json({
        message: "Error generating year comparison report",
        error: error?.message || "Unknown error",
      });
    }
  }

  /**
   * Customer Purchase History and Analytics
   * GET /reports/customers/:knownUserId
   * Query params: companyId, shopId (optional)
   */
  static async customerAnalytics(req, res) {
    try {
      const { knownUserId } = req.params;
      const { companyId, shopId } = getParams(req, "companyId", "shopId");

      if (!companyId) {
        return res.status(400).json({
          message: "Missing required parameter: companyId",
        });
      }

      const analytics = await ReportsService.getCustomerAnalytics(
        companyId,
        parseInt(knownUserId),
        shopId
      );

      return res.status(200).json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      logger.error("Error generating customer analytics:", error);
      return res.status(500).json({
        message: "Error generating customer analytics",
        error: error?.message || "Unknown error",
      });
    }
  }

  /**
   * Payment Method Analytics
   * GET /reports/payment-methods
   * Query params: companyId, shopId (optional), startDate, endDate
   */
  static async paymentMethodAnalytics(req, res) {
    try {
      const { companyId, shopId, startDate, endDate } = getParams(req, "companyId", "shopId", "startDate", "endDate");

      if (!companyId || !startDate || !endDate) {
        return res.status(400).json({
          message: "Missing required parameters: companyId, startDate, endDate",
        });
      }

      const methods = await ReportsService.getPaymentMethodAnalytics(
        companyId,
        shopId,
        new Date(startDate),
        new Date(endDate)
      );

      return res.status(200).json({
        success: true,
        data: methods,
      });
    } catch (error) {
      logger.error("Error generating payment method analytics:", error);
      return res.status(500).json({
        message: "Error generating payment method analytics",
        error: error?.message || "Unknown error",
      });
    }
  }

  /**
   * Quick Revenue Summary
   * GET /reports/revenue/summary
   * Query params: companyId, shopId (optional), startDate, endDate
   */
  static async revenueSummary(req, res) {
    try {
      const { companyId, shopId, startDate, endDate, debug, paymentStatus } = getParams(req, "companyId", "shopId", "startDate", "endDate", "debug", "paymentStatus");

      if (!companyId || !startDate || !endDate) {
        return res.status(400).json({
          message: "Missing required parameters: companyId, startDate, endDate",
        });
      }

      const revenue = await ReportsService.calculateRevenue(
        companyId,
        shopId,
        new Date(startDate),
        new Date(endDate),
        { debug: debug === true || debug === 'true', paymentStatus }
      );

      return res.status(200).json({
        success: true,
        data: revenue,
      });
    } catch (error) {
      logger.error("Error generating revenue summary:", error);
      return res.status(500).json({
        message: "Error generating revenue summary",
        error: error?.message || "Unknown error",
      });
    }
  }
}

module.exports = ReportsController;
