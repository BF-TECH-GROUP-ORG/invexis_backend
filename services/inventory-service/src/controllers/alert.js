const asyncHandler = require('express-async-handler');
const Alert = require('../models/Alert');
const { validateMongoId } = require('../utils/validator');

const createAlert = asyncHandler(async (req, res) => {
  const alert = new Alert({ ...req.body, companyId: req.user.companyId });
  await alert.save();
  res.status(201).json({ success: true, data: alert });
});

const getUnresolvedAlerts = asyncHandler(async (req, res) => {
  const alerts = await Alert.getUnresolvedAlerts(req.user.companyId);
  res.json({ success: true, data: alerts });
});

module.exports = { createAlert, getUnresolvedAlerts };