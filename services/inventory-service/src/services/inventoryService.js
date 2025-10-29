// inventoryService.js (Improved)
const mongoose = require('mongoose');
const Product = require('../models/Product');
const StockChange = require('../models/StockChange');
const Category = require('../models/Category');
const { logger } = require('../utils/logger');

const addProduct = async (data) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const existing = await Product.findOne({ $or: [{ asin: data.asin }, { sku: data.sku }], companyId: data.companyId }).session(session);
    if (existing) throw new Error('ASIN or SKU already exists');

    const product = new Product(data);
    await product.save({ session });

    // Initial stock with warehouse/variation support if provided
    if (data.inventory.quantity > 0) {
      const stockChange = new StockChange({
        companyId: data.companyId,
        productId: product._id,
        variationId: data.variationId || null,
        warehouseId: data.warehouseId || null,
        changeType: 'restock',
        quantity: data.inventory.quantity,
        previousStock: 0,
        reason: 'Initial stock addition'
      });
      await stockChange.save({ session });
    }

    // Update category stats
    if (product.category) {
      await Category.findByIdAndUpdate(product.category, { $inc: { 'statistics.totalProducts': 1 } }, { session });
    }

    await session.commitTransaction();
    return product;
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error adding product: %s', error.message);
    throw error;
  } finally {
    session.endSession();
  }
};

const updateProduct = async (asin, companyId, data) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const product = await Product.findOne({ asin, companyId }).session(session);
    if (!product) throw new Error('Product not found or not owned');

    // Handle stock delta with variation/warehouse
    const stockDelta = data.inventory?.quantity - product.inventory.quantity;
    if (stockDelta !== 0) {
      const stockChange = new StockChange({
        companyId,
        productId: product._id,
        variationId: data.variationId || null,
        warehouseId: data.warehouseId || null,
        changeType: stockDelta > 0 ? 'restock' : 'adjustment',
        quantity: stockDelta,
        previousStock: product.inventory.quantity,
        reason: data.reason || (stockDelta > 0 ? 'Restock update' : 'Stock adjustment')
      });
      await stockChange.save({ session });
    }

    const updatedProduct = await Product.findOneAndUpdate(
      { asin, companyId },
      data,
      { new: true, runValidators: true, session }
    );

    await session.commitTransaction();
    return updatedProduct;
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error updating product: %s', error.message);
    throw error;
  } finally {
    session.endSession();
  }
};

const deleteProduct = async (asin, companyId) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const product = await Product.findOne({ asin, companyId }).session(session);
    if (!product) throw new Error('Product not found or not owned');

    // Log final stock adjustment if any
    if (product.inventory.quantity > 0) {
      const stockChange = new StockChange({
        companyId,
        productId: product._id,
        changeType: 'adjustment',
        quantity: -product.inventory.quantity,
        previousStock: product.inventory.quantity,
        reason: 'Product deletion'
      });
      await stockChange.save({ session });
    }

    await Product.deleteOne({ asin, companyId }, { session });

    // Update category stats
    if (product.category) {
      await Category.findByIdAndUpdate(product.category, { $inc: { 'statistics.totalProducts': -1 } }, { session });
    }

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error deleting product: %s', error.message);
    throw error;
  } finally {
    session.endSession();
  }
};

const getProductByAsin = async (asin, companyId) => {
  const product = await Product.findOne({ asin, companyId }).populate('category subcategory subSubcategory');
  if (!product) throw new Error('Product not found or not owned');
  return product;
};

const getProducts = async (companyId, { category, keyword, page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' }) => {
  const filter = { companyId };
  if (category) filter.category = category; // Use ID for exact match
  if (keyword) filter.$text = { $search: keyword };

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

  const [products, total] = await Promise.all([
    Product.find(filter).populate('category', 'name').sort(sort).skip(skip).limit(parseInt(limit)).lean(),
    Product.countDocuments(filter)
  ]);

  return {
    products,
    pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
  };
};

module.exports = { addProduct, updateProduct, deleteProduct, getProductByAsin, getProducts };