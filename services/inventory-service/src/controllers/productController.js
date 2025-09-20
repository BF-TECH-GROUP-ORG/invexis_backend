const { productValidationSchema } = require('../utils/validator');
const { logger } = require('../utils/logger');
const { addProduct, updateProduct, deleteProduct, getProductByAsin, getProducts } = require('../services/inventoryService');
const { publishProductEvent } = require('../events/productEvents');

exports.addProduct = async (req, res, next) => {
  try {
    const { companyId } = req.user;
    const { error, value } = productValidationSchema.validate({ ...req.body, companyId });
    if (error) return res.status(400).json({ error: error.details[0].message });

    const product = await addProduct(value);
    await publishProductEvent('product.created', { companyId, asin: product.asin, title: product.title });

    logger.info(`Product added by company ${companyId}: ${product.asin}`);
    res.status(201).json({ message: 'Product listed', asin: product.asin });
  } catch (error) {
    next(error);
  }
};

exports.updateProduct = async (req, res, next) => {
  try {
    const { companyId } = req.user;
    const { asin } = req.params;
    const { error, value } = productValidationSchema.validate({ ...req.body, companyId });
    if (error) return res.status(400).json({ error: error.details[0].message });

    const product = await updateProduct(asin, companyId, value);
    await publishProductEvent('product.updated', { companyId, asin, title: product.title });

    logger.info(`Product updated by company ${companyId}: ${asin}`);
    res.json({ message: 'Product updated', product });
  } catch (error) {
    next(error);
  }
};

exports.deleteProduct = async (req, res, next) => {
  try {
    const { companyId } = req.user;
    const { asin } = req.params;

    await deleteProduct(asin, companyId);
    await publishProductEvent('product.deleted', { companyId, asin });

    logger.info(`Product deleted by company ${companyId}: ${asin}`);
    res.json({ message: 'Product deleted' });
  } catch (error) {
    next(error);
  }
};

exports.getProductByAsin = async (req, res, next) => {
  try {
    const { companyId } = req.user;
    const { asin } = req.params;

    const product = await getProductByAsin(asin, companyId);
    res.json(product);
  } catch (error) {
    next(error);
  }
};

exports.getProducts = async (req, res, next) => {
  try {
    const { companyId } = req.user;
    const { category, keyword, page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    const { products, pagination } = await getProducts(companyId, { category, keyword, page, limit, sortBy, sortOrder });
    res.json({ products, pagination });
  } catch (error) {
    next(error);
  }
};