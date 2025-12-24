/**
 * Analytics Graph Service
 * Provides time-series data for inventory trends and profit comparisons
 * Optimized for frontend graph visualization
 */

const StockChange = require('../models/StockChange');
const Product = require('../models/Product');
const ProductPricing = require('../models/ProductPricing');
const logger = require('../utils/logger');

class AnalyticsGraphService {
  /**
   * Get inventory trends data (stock levels, movements, velocity)
   * @param {string} companyId
   * @param {string} shopId - optional
   * @param {string} period - 'daily' | 'weekly' | 'monthly'
   * @param {number} rangeInDays - how many days back (default: 30)
   * @returns {object} - time-series data formatted for graphs
   */
  static async getInventoryTrends(companyId, shopId = null, period = 'daily', rangeInDays = 30) {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - rangeInDays);

      const matchStage = {
        companyId,
        createdAt: { $gte: startDate, $lte: endDate }
      };

      if (shopId) matchStage.shopId = shopId;

      // Aggregate stock changes by period
      const groupStage = this._getGroupStagePeriod(period);

      const trends = await StockChange.aggregate([
        {
          $addFields: {
            qtyNorm: { $ifNull: ['$qty', '$quantity'] },
            typeNorm: { $ifNull: ['$type', '$changeType'] },
            createdAtNorm: { $ifNull: ['$createdAt', '$changeDate'] }
          }
        },
        {
          $match: {
            companyId,
            ...(shopId ? { shopId } : {}),
            createdAtNorm: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: groupStage,
            inboundQty: {
              $sum: {
                $cond: [
                  { $in: ['$typeNorm', ['purchase', 'restock', 'transfer_in', 'adjustment_in', 'stockin']] },
                  '$qtyNorm',
                  0
                ]
              }
            },
            outboundQty: {
              $sum: {
                $cond: [
                  { $in: ['$typeNorm', ['sale', 'transfer_out', 'adjustment_out', 'damage', 'adjustment']] },
                  { $abs: '$qtyNorm' },
                  0
                ]
              }
            },
            totalTransactions: { $sum: 1 },
            uniqueProducts: { $addToSet: '$productId' },
            // Revenue metrics
            revenue: {
              $sum: {
                $cond: [
                  { $eq: ['$typeNorm', 'sale'] },
                  { $multiply: [{ $abs: '$qtyNorm' }, { $ifNull: ['$meta.unitPrice', 0] }] },
                  0
                ]
              }
            },
            // Cost metrics
            cost: {
              $sum: {
                $cond: [
                  { $in: ['$typeNorm', ['sale', 'adjustment_out', 'damage', 'adjustment']] },
                  { $multiply: [{ $abs: '$qtyNorm' }, { $ifNull: ['$meta.unitCost', 0] }] },
                  0
                ]
              }
            }
          }
        },
        { $sort: { '_id': 1 } }
      ]);

      // Format and calculate metrics
      const graphData = trends.map(item => {
        const netMovement = item.inboundQty - item.outboundQty;
        const profit = item.revenue - item.cost;
        const profitMargin = item.revenue > 0 ? ((profit / item.revenue) * 100).toFixed(2) : 0;

        return {
          date: this._formatDateByPeriod(item._id, period),
          timestamp: item._id,
          metrics: {
            inbound: item.inboundQty,
            outbound: item.outboundQty,
            netMovement: netMovement,
            transactionCount: item.totalTransactions,
            uniqueProducts: item.uniqueProducts.length
          },
          financial: {
            revenue: parseFloat(item.revenue.toFixed(2)),
            cost: parseFloat(item.cost.toFixed(2)),
            profit: parseFloat(profit.toFixed(2)),
            profitMargin: parseFloat(profitMargin)
          }
        };
      });

      return {
        success: true,
        period,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          rangeInDays
        },
        summary: {
          totalInbound: trends.reduce((sum, t) => sum + t.inboundQty, 0),
          totalOutbound: trends.reduce((sum, t) => sum + t.outboundQty, 0),
          totalRevenue: parseFloat(trends.reduce((sum, t) => sum + t.revenue, 0).toFixed(2)),
          totalCost: parseFloat(trends.reduce((sum, t) => sum + t.cost, 0).toFixed(2)),
          totalProfit: parseFloat(
            trends.reduce((sum, t) => sum + (t.revenue - t.cost), 0).toFixed(2)
          )
        },
        data: graphData
      };
    } catch (error) {
      logger.error('Error fetching inventory trends:', error);
      throw error;
    }
  }

  /**
   * Get profit comparison across time periods
   * @param {string} companyId
   * @param {string} shopId - optional
   * @returns {object} - comparison data for today/yesterday, week, month, year
   */
  static async getProfitComparison(companyId, shopId = null) {
    try {
      const matchStage = { companyId };
      if (shopId) matchStage.shopId = shopId;

      // Calculate period boundaries
      const periods = this._calculatePeriodBoundaries();

      // Fetch data for all periods
      const periodResults = {};

      for (const [periodKey, { startDate, endDate, label }] of Object.entries(periods)) {
        const data = await StockChange.aggregate([
          {
            $addFields: {
              qtyNorm: { $ifNull: ['$qty', '$quantity'] },
              typeNorm: { $ifNull: ['$type', '$changeType'] },
              createdAtNorm: { $ifNull: ['$createdAt', '$changeDate'] }
            }
          },
          {
            $match: {
              companyId,
              ...(shopId ? { shopId } : {}),
              createdAtNorm: { $gte: startDate, $lte: endDate }
            }
          },
          {
            $group: {
              _id: null,
              totalRevenue: {
                $sum: {
                  $cond: [
                    { $eq: ['$typeNorm', 'sale'] },
                    { $multiply: [{ $abs: '$qtyNorm' }, { $ifNull: ['$meta.unitPrice', 0] }] },
                    0
                  ]
                }
              },
              totalCost: {
                $sum: {
                  $cond: [
                    { $in: ['$typeNorm', ['sale', 'adjustment_out', 'damage', 'adjustment']] },
                    { $multiply: [{ $abs: '$qtyNorm' }, { $ifNull: ['$meta.unitCost', 0] }] },
                    0
                  ]
                }
              },
              totalUnits: {
                $sum: {
                  $cond: [{ $eq: ['$typeNorm', 'sale'] }, { $abs: '$qtyNorm' }, 0]
                }
              },
              transactionCount: { $sum: 1 }
            }
          }
        ]);

        const metrics = data[0] || {
          totalRevenue: 0,
          totalCost: 0,
          totalUnits: 0,
          transactionCount: 0
        };

        const profit = metrics.totalRevenue - metrics.totalCost;
        const profitMargin =
          metrics.totalRevenue > 0
            ? ((profit / metrics.totalRevenue) * 100).toFixed(2)
            : 0;

        periodResults[periodKey] = {
          label,
          date: { start: startDate.toISOString(), end: endDate.toISOString() },
          metrics: {
            revenue: parseFloat(metrics.totalRevenue.toFixed(2)),
            cost: parseFloat(metrics.totalCost.toFixed(2)),
            profit: parseFloat(profit.toFixed(2)),
            profitMargin: parseFloat(profitMargin),
            units: metrics.totalUnits,
            transactions: metrics.transactionCount,
            avgProfitPerTransaction:
              metrics.transactionCount > 0
                ? parseFloat((profit / metrics.transactionCount).toFixed(2))
                : 0
          }
        };
      }

      // Calculate comparisons
      const comparisons = {
        today_vs_yesterday: this._calculateComparison(
          periodResults.today.metrics,
          periodResults.yesterday.metrics,
          'today vs yesterday'
        ),
        thisWeek_vs_lastWeek: this._calculateComparison(
          periodResults.thisWeek.metrics,
          periodResults.lastWeek.metrics,
          'this week vs last week'
        ),
        thisMonth_vs_lastMonth: this._calculateComparison(
          periodResults.thisMonth.metrics,
          periodResults.lastMonth.metrics,
          'this month vs last month'
        ),
        thisYear_vs_lastYear: this._calculateComparison(
          periodResults.thisYear.metrics,
          periodResults.lastYear.metrics,
          'this year vs last year'
        )
      };

      return {
        success: true,
        generatedAt: new Date().toISOString(),
        periods: periodResults,
        comparisons
      };
    } catch (error) {
      logger.error('Error fetching profit comparison:', error);
      throw error;
    }
  }

  /**
   * Get product-specific profit trends
   * @param {string} companyId
   * @param {string} productId - optional, if not provided returns top products
   * @param {number} rangeInDays - default 30
   * @returns {object} - product profit trends
   */
  static async getProductProfitTrends(companyId, productId = null, rangeInDays = 30) {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - rangeInDays);

      const matchStage = {
        companyId,
        type: 'sale',
        createdAt: { $gte: startDate, $lte: endDate }
      };

      if (productId) matchStage.productId = productId;

      const trends = await StockChange.aggregate([
        {
          $addFields: {
            qtyNorm: { $ifNull: ['$qty', '$quantity'] },
            typeNorm: { $ifNull: ['$type', '$changeType'] },
            createdAtNorm: { $ifNull: ['$createdAt', '$changeDate'] }
          }
        },
        {
          $match: {
            companyId,
            ...(productId ? { productId: new (require('mongoose')).Types.ObjectId(productId) } : {}),
            typeNorm: 'sale',
            createdAtNorm: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: {
              productId: '$productId',
              date: {
                $dateToString: { format: '%Y-%m-%d', date: '$createdAtNorm' }
              }
            },
            quantity: { $sum: { $abs: '$qtyNorm' } },
            revenue: { $sum: { $multiply: [{ $abs: '$qtyNorm' }, { $ifNull: ['$meta.unitPrice', 0] }] } },
            cost: { $sum: { $multiply: [{ $abs: '$qtyNorm' }, { $ifNull: ['$meta.unitCost', 0] }] } }
          }
        },
        {
          $group: {
            _id: '$_id.productId',
            dates: {
              $push: {
                date: '$_id.date',
                quantity: '$quantity',
                revenue: '$revenue',
                cost: '$cost',
                profit: { $subtract: ['$revenue', '$cost'] },
                profitMargin: {
                  $cond: [
                    { $gt: ['$revenue', 0] },
                    { $multiply: [{ $divide: [{ $subtract: ['$revenue', '$cost'] }, '$revenue'] }, 100] },
                    0
                  ]
                }
              }
            },
            totalRevenue: { $sum: '$revenue' },
            totalCost: { $sum: '$cost' },
            totalUnits: { $sum: '$quantity' }
          }
        },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'productInfo'
          }
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: productId ? 1 : 10 }
      ]);

      const formattedTrends = trends.map(item => {
        const totalProfit = item.totalRevenue - item.totalCost;
        return {
          productId: item._id,
          productName: item.productInfo[0]?.name || 'Unknown',
          summary: {
            totalRevenue: parseFloat(item.totalRevenue.toFixed(2)),
            totalCost: parseFloat(item.totalCost.toFixed(2)),
            totalProfit: parseFloat(totalProfit.toFixed(2)),
            profitMargin: item.totalRevenue > 0
              ? parseFloat(((totalProfit / item.totalRevenue) * 100).toFixed(2))
              : 0,
            unitsSold: item.totalUnits
          },
          dailyTrends: item.dates.map(d => ({
            date: d.date,
            quantity: d.quantity,
            revenue: parseFloat(d.revenue.toFixed(2)),
            cost: parseFloat(d.cost.toFixed(2)),
            profit: parseFloat(d.profit.toFixed(2)),
            profitMargin: parseFloat(d.profitMargin.toFixed(2))
          }))
        };
      });

      return {
        success: true,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          rangeInDays
        },
        data: formattedTrends
      };
    } catch (error) {
      logger.error('Error fetching product profit trends:', error);
      throw error;
    }
  }

  // ============ HELPER METHODS ============

  static _getGroupStagePeriod(period) {
    const createdAt = '$createdAtNorm';
    switch (period) {
      case 'weekly':
        return {
          year: { $year: createdAt },
          week: { $week: createdAt }
        };
      case 'monthly':
        return {
          year: { $year: createdAt },
          month: { $month: createdAt }
        };
      case 'daily':
      default:
        return {
          year: { $year: createdAt },
          month: { $month: createdAt },
          day: { $dayOfMonth: createdAt }
        };
    }
  }

  static _formatDateByPeriod(dateObj, period) {
    switch (period) {
      case 'weekly':
        return `${dateObj.year}-W${String(dateObj.week).padStart(2, '0')}`;
      case 'monthly':
        return `${dateObj.year}-${String(dateObj.month).padStart(2, '0')}`;
      case 'daily':
      default:
        return `${dateObj.year}-${String(dateObj.month).padStart(2, '0')}-${String(
          dateObj.day
        ).padStart(2, '0')}`;
    }
  }

  static _calculatePeriodBoundaries() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Week boundaries
    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(thisWeekStart);
    lastWeekEnd.setTime(lastWeekEnd.getTime() - 1);

    // Month boundaries
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(thisMonthStart);
    lastMonthEnd.setTime(lastMonthEnd.getTime() - 1);

    // Year boundaries
    const thisYearStart = new Date(now.getFullYear(), 0, 1);
    const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
    const lastYearEnd = new Date(thisYearStart);
    lastYearEnd.setTime(lastYearEnd.getTime() - 1);

    return {
      today: {
        startDate: today,
        endDate: new Date(),
        label: 'Today'
      },
      yesterday: {
        startDate: yesterday,
        endDate: today,
        label: 'Yesterday'
      },
      thisWeek: {
        startDate: thisWeekStart,
        endDate: new Date(),
        label: 'This Week'
      },
      lastWeek: {
        startDate: lastWeekStart,
        endDate: lastWeekEnd,
        label: 'Last Week'
      },
      thisMonth: {
        startDate: thisMonthStart,
        endDate: new Date(),
        label: 'This Month'
      },
      lastMonth: {
        startDate: lastMonthStart,
        endDate: lastMonthEnd,
        label: 'Last Month'
      },
      thisYear: {
        startDate: thisYearStart,
        endDate: new Date(),
        label: 'This Year'
      },
      lastYear: {
        startDate: lastYearStart,
        endDate: lastYearEnd,
        label: 'Last Year'
      }
    };
  }

  static _calculateComparison(current, previous, label) {
    const profitDiff = current.profit - previous.profit;
    const profitDiffPercent =
      previous.profit !== 0
        ? ((profitDiff / Math.abs(previous.profit)) * 100).toFixed(2)
        : previous.profit === 0 && current.profit > 0
          ? 100
          : 0;

    const revenueDiffPercent =
      previous.revenue !== 0
        ? (((current.revenue - previous.revenue) / previous.revenue) * 100).toFixed(2)
        : 0;

    const trend = profitDiff > 0 ? 'up' : profitDiff < 0 ? 'down' : 'neutral';

    return {
      label,
      current: current,
      previous: previous,
      diff: {
        profitChange: parseFloat(profitDiff.toFixed(2)),
        profitChangePercent: parseFloat(profitDiffPercent),
        revenueChangePercent: parseFloat(revenueDiffPercent),
        trend
      }
    };
  }
}

module.exports = AnalyticsGraphService;
