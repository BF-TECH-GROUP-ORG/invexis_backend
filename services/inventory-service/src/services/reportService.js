const ProductReport = require('../models/ProductReport');
const DailyReport = require('../models/DailyReport');
const { consumeSalesEvents } = require('../events/reportEvents');
const logger = require('../utils/logger');

const scheduleDailyReport = async () => {
  try {
    await consumeSalesEvents(async (event) => {
      const { productId, quantity, companyId } = event;
      const report = await ProductReport.findOneAndUpdate(
        { productId, companyId },
        { $inc: { totalSold: quantity } },
        { upsert: true, new: true }
      );
      logger.info(`Updated product report for product ${productId}`);
    });
  } catch (error) {
    logger.error('Error scheduling daily report:', error);
  }
};

module.exports = { scheduleDailyReport };