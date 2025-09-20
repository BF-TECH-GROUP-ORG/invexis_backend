const { logger } = require('../utils/logger');
const { getDailyReport, getProductReport } = require('../services/reportService');

exports.getDailyReport = async (req, res, next) => {
  try {
    const { companyId } = req.user;
    const { date } = req.query;
    const reportDate = date ? new Date(date) : new Date();
    reportDate.setHours(0, 0, 0, 0);

    const report = await getDailyReport(companyId, reportDate);
    res.json(report);
  } catch (error) {
    next(error);
  }
};

exports.getProductReport = async (req, res, next) => {
  try {
    const { companyId } = req.user;
    const { productId } = req.params;

    const report = await getProductReport(companyId, productId);
    res.json(report);
  } catch (error) {
    next(error);
  }
};