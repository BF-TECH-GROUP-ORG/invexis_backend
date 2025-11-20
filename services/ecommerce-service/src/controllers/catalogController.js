// const CatalogProduct = require('../models/Catalog.models');

// // List products (all fields)
// exports.listProducts = async (req, res) => {
//   try {
//     const { companyId, shopId, status = 'active' } = req.query;
//     const filter = { isDeleted: false };
//     if (companyId) filter.companyId = companyId;
//     if (shopId) filter.shopId = shopId;
//     if (status) filter.status = status;
//     const products = await CatalogProduct.find(filter);
//     res.json(products.map(p => p.toObject()));
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// // Get product by id (all fields)
// exports.getProduct = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const product = await CatalogProduct.findOne({ productId: id, isDeleted: false });
//     if (!product) return res.status(404).json({ message: 'Product not found' });
//     res.json(product.toObject());
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// // Helper: Validate LocalizedString
// function isValidLocalizedString(obj) {
//   if (typeof obj !== 'object' || obj === null) return false;
//   return Object.keys(obj).length > 0 && Object.values(obj).every(v => typeof v === 'string');
// }
// function isValidImage(img) {
//   return img && typeof img.url === 'string' && (!img.alt || isValidLocalizedString(img.alt));
// }
// function isValidSeo(seo) {
//   if (!seo) return true;
//   if (seo.slug && typeof seo.slug !== 'string') return false;
//   if (seo.metaTitle && !isValidLocalizedString(seo.metaTitle)) return false;
//   if (seo.metaDescription && !isValidLocalizedString(seo.metaDescription)) return false;
//   return true;
// }
// function validateCatalogProductBody(body, isUpdate = false) {
//   const errors = [];
//   if (!isUpdate) {
//     if (!body.productId || typeof body.productId !== 'string') errors.push('productId (string) is required');
//     if (!body.companyId || typeof body.companyId !== 'string') errors.push('companyId (string) is required');
//     if (!body.title || !isValidLocalizedString(body.title)) errors.push('title (LocalizedString) is required');
//     if (typeof body.price !== 'number') errors.push('price (number) is required');
//     if (!body.currency || typeof body.currency !== 'string') errors.push('currency (string) is required');
//   }
//   if (body.shopId && typeof body.shopId !== 'string') errors.push('shopId must be string');
//   if (body.shortDescription && !isValidLocalizedString(body.shortDescription)) errors.push('shortDescription must be LocalizedString');
//   if (body.longDescription && !isValidLocalizedString(body.longDescription)) errors.push('longDescription must be LocalizedString');
//   if (body.images && (!Array.isArray(body.images) || !body.images.every(isValidImage))) errors.push('images must be array of valid images');
//   if (body.seo && !isValidSeo(body.seo)) errors.push('seo must be valid SEO object');
//   if (body.compareAtPrice && typeof body.compareAtPrice !== 'number') errors.push('compareAtPrice must be number');
//   if (body.tags && (!Array.isArray(body.tags) || !body.tags.every(t => typeof t === 'string'))) errors.push('tags must be array of strings');
//   if (body.featured !== undefined && typeof body.featured !== 'boolean') errors.push('featured must be boolean');
//   if (body.visibility && !['public','private','unlisted'].includes(body.visibility)) errors.push('visibility must be one of public, private, unlisted');
//   if (body.status && !['active','inactive','archived'].includes(body.status)) errors.push('status must be one of active, inactive, archived');
//   if (body.createdBy && typeof body.createdBy !== 'string') errors.push('createdBy must be string');
//   if (body.updatedBy && typeof body.updatedBy !== 'string') errors.push('updatedBy must be string');
//   if (body.isDeleted !== undefined && typeof body.isDeleted !== 'boolean') errors.push('isDeleted must be boolean');
//   if (body.deletedAt && isNaN(Date.parse(body.deletedAt))) errors.push('deletedAt must be a valid date');
//   if (body.defaultLocale && typeof body.defaultLocale !== 'string') errors.push('defaultLocale must be string');
//   if (body.defaultCurrency && typeof body.defaultCurrency !== 'string') errors.push('defaultCurrency must be string');
//   if (body.metadata && typeof body.metadata !== 'object') errors.push('metadata must be object');
//   return errors;
// }
// // Create product (all fields)
// exports.createProduct = async (req, res) => {
//   const errors = validateCatalogProductBody(req.body);
//   if (errors.length) return res.status(400).json({ errors });
//   try {
//     const product = new CatalogProduct(req.body);
//     await product.save();
//     res.status(201).json(product.toObject());
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// };

// // Update product (all fields)
// exports.updateProduct = async (req, res) => {
//   const errors = validateCatalogProductBody(req.body, true);
//   if (errors.length) return res.status(400).json({ errors });
//   try {
//     const { id } = req.params;
//     const product = await CatalogProduct.findOneAndUpdate(
//       { productId: id, isDeleted: false },
//       req.body,
//       { new: true }
//     );
//     if (!product) return res.status(404).json({ message: 'Product not found' });
//     res.json(product.toObject());
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// };

// // Delete product (soft, all fields)
// exports.deleteProduct = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const product = await CatalogProduct.findOneAndUpdate(
//       { productId: id, isDeleted: false },
//       { isDeleted: true, deletedAt: new Date() },
//       { new: true }
//     );
//     if (!product) return res.status(404).json({ message: 'Product not found' });
//     res.json(product.toObject());
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// };



const { search: listProducts, findByProductId: getProduct, create: createProduct, update: updateProduct, } = require('../services/catalogService');
const { productSchema } = require('../utils/app');

exports.listProducts = async (req, res) => {
  try {
    const { companyId, shopId, status, page, limit, category, keyword, sortBy, sortOrder } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId is required' });
    const products = await listProducts(companyId, { shopId, status, page, limit, category, keyword, sortBy, sortOrder });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getProduct = async (req, res) => {
  try {
    const { id: productId } = req.params;
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId is required' });
    const product = await getProduct(productId, companyId);
    res.json(product);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const { error, value } = productSchema.validate(req.body);
    if (error) return res.status(400).json({ errors: error.details.map(d => d.message) });
    const { companyId } = req.user;
    const product = await createProduct(companyId, value);
    res.status(201).json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const { error, value } = productSchema.validate(req.body);
    if (error) return res.status(400).json({ errors: error.details.map(d => d.message) });
    const { id: productId } = req.params;
    const { companyId } = req.user;
    const product = await updateProduct(productId, companyId, value);
    res.json(product);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const { id: productId } = req.params;
    const { companyId } = req.user;
    const result = await deleteProduct(productId, companyId);
    res.json(result);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
  }
};