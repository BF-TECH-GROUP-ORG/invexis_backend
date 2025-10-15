const asyncHandler = require('express-async-handler');
const { validationResult } = require('express-validator');
const Warehouse = require('../models/Warehouse');
const { validateMongoId } = require('../utils/validateMongoId');

const getAllWarehouses = asyncHandler(async (req, res) => {
  const { companyId, page = 1, limit = 20 } = req.query;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'Company ID is required' });
  }
//   validateMongoId(companyId);

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const query = { companyId };

  const warehouses = await Warehouse.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Warehouse.countDocuments(query);

  res.status(200).json({
    success: true,
    data: warehouses,
    pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
  });
});

const getWarehouseById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateMongoId(id);

  const warehouse = await Warehouse.findById(id);

  if (!warehouse) {
    return res.status(404).json({ success: false, message: 'Warehouse not found' });
  }

  res.status(200).json({ success: true, data: warehouse });
});

const createWarehouse = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation errors', errors: errors.array() });
  }

  const warehouse = new Warehouse({
    ...req.body,
    companyId: "testCompany"
  });
  await warehouse.save();

  res.status(201).json({ success: true, message: 'Warehouse created successfully', data: warehouse });
});

const updateWarehouse = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateMongoId(id);

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation errors', errors: errors.array() });
  }

  const warehouse = await Warehouse.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });

  if (!warehouse) {
    return res.status(404).json({ success: false, message: 'Warehouse not found' });
  }

  res.status(200).json({ success: true, message: 'Warehouse updated successfully', data: warehouse });
});

const deleteWarehouse = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateMongoId(id);

  const warehouse = await Warehouse.findByIdAndDelete(id);

  if (!warehouse) {
    return res.status(404).json({ success: false, message: 'Warehouse not found' });
  }

  res.status(200).json({ success: true, message: 'Warehouse deleted successfully' });
});

module.exports = {
  getAllWarehouses,
  getWarehouseById,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse
};