const mongoose = require('mongoose');
const Product = require('../models/Product');
const StockChange = require('../models/StockChange');

const addProduct = async (data) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const existing = await Product.findOne({ $or: [{ asin: data.asin }, { sku: data.sku }] }).session(session);
    if (existing) throw new Error('ASIN or SKU already exists');

    const product = new Product(data);
    await product.save({ session });

    if (data.stockQty > 0) {
      const stockChange = new StockChange({
        companyId: data.companyId,
        productId: product._id,
        changeType: 'restock',
        quantity: data.stockQty,
        reason: 'Initial stock addition'
      });
      await stockChange.save({ session });
    }

    await session.commitTransaction();
    return product;
  } catch (error) {
    await session.abortTransaction();
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

    const stockChangeQty = data.stockQty - product.stockQty;
    if (stockChangeQty !== 0) {
      const stockChange = new StockChange({
        companyId,
        productId: product._id,
        changeType: stockChangeQty > 0 ? 'restock' : 'adjustment',
        quantity: stockChangeQty,
        reason: stockChangeQty > 0 ? 'Restock update' : 'Stock adjustment'
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
    throw error;
  } finally {
    session.endSession();
  }
};

const deleteProduct = async (asin, companyId) => {
  const product = await Product.findOneAndDelete({ asin, companyId });
  if (!product) throw new Error('Product not found or not owned');
};

const getProductByAsin = async (asin, companyId) => {
  const product = await Product.findOne({ asin, companyId });
  if (!product) throw new Error('Product not found or not owned');
  return product;
};

const getProducts = async (companyId, { category, keyword, page, limit, sortBy, sortOrder }) => {
  const filter = { companyId };
  if (category) filter.category = { $regex: category, $options: 'i' };
  if (keyword) filter.$text = { $search: keyword };

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

  const [products, total] = await Promise.all([
    Product.find(filter).sort(sort).skip(skip).limit(parseInt(limit)).lean(),
    Product.countDocuments(filter)
  ]);

  return {
    products,
    pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
  };
};

module.exports = { addProduct, updateProduct, deleteProduct, getProductByAsin, getProducts };