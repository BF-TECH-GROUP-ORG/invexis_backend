const schedule = require('node-schedule');
const DailyReport = require('../models/DailyReport');
const ProductReport = require('../models/ProductReport');
const StockChange = require('../models/StockChange');
const Product = require('../models/Product');
const { logger } = require('../utils/logger');
const { consumeSalesEvents } = require('../events/reportEvents');

const scheduleDailyReport = () => {
  schedule.scheduleJob('0 0 * * *', async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);

      const companies = await Product.distinct('companyId');
      for (const companyId of companies) {
        const stockChanges = await StockChange.aggregate([
          { $match: { companyId, changeDate: { $gte: today, $lt: tomorrow } } },
          {
            $group: {
              _id: '$productId',
              netChange: { $sum: '$quantity' },
              restocks: { $sum: { $cond: [{ $eq: ['$changeType', 'restock'] }, '$quantity', 0] } }
            }
          }
        ]);

        const products = await Product.find({ companyId });
        const stockSnapshot = stockChanges.map(change => ({
          productId: change._id,
          netChange: change.netChange,
          endingStock: products.find(p => p._id.equals(change._id))?.stockQty || 0
        }));

        await DailyReport.findOneAndUpdate(
          { companyId, reportDate: today },
          {
            companyId,
            reportDate: today,
            totalRestocks: stockChanges.reduce((sum, c) => sum + c.restocks, 0),
            stockChanges: stockSnapshot,
            generatedAt: new Date()
          },
          { upsert: true }
        );

        for (const product of products) {
          await ProductReport.findOneAndUpdate(
            { productId: product._id, companyId },
            {
              companyId,
              productId: product._id,
              stockHistory: [...(await ProductReport.findOne({ productId: product._id })?.stockHistory || []), { date: today, stockQty: product.stockQty }],
              updatedAt: new Date()
            },
            { upsert: true }
          );
        }

        logger.info(`Daily report generated for company ${companyId}`);
      }
    } catch (error) {
      logger.error('Daily report generation error:', error);
    }
  });

  consumeSalesEvents();
};

const getDailyReport = async (companyId, reportDate) => {
  const report = await DailyReport.findOne({ companyId, reportDate }).populate('stockChanges.productId');
  if (!report) throw new Error('No report for specified date');
  return report;
};

const getProductReport = async (companyId, productId) => {
  const report = await ProductReport.findOne({ companyId, productId }).populate('productId');
  if (!report) throw new Error('No report for product');
  return report;
};

const updateProductReportFromSale = async ({ companyId, productId, quantity, totalAmount }) => {
  const session = await ProductReport.startSession();
  session.startTransaction();
  try {
    const product = await Product.findById(productId).session(session);
    if (!product || product.companyId !== companyId) throw new Error('Invalid product or company');

    await Product.findByIdAndUpdate(productId, { $inc: { stockQty: -quantity } }, { session });

    const stockChange = new StockChange({
      companyId,
      productId,
      changeType: 'adjustment',
      quantity: -quantity,
      reason: 'Sale from external service'
    });
    await stockChange.save({ session });

    await ProductReport.findOneAndUpdate(
      { productId, companyId },
      {
        $inc: { totalSales: quantity, totalRevenue: totalAmount },
        $set: { lastSaleDate: new Date(), updatedAt: new Date() }
      },
      { upsert: true, session }
    );

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

module.exports = { scheduleDailyReport, getDailyReport, getProductReport, updateProductReportFromSale };