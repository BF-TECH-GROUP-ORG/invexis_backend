const { search: listProducts, findByProductId: getProduct, create: createProduct, update: updateProduct, } = require('../services/catalogService');
const { catalogProductSchema, paginationSchema } = require('../utils/app');

exports.listProducts = async (req, res) => {
  try {
    const { companyId, shopId, status, page, limit, category, keyword, sortBy, sortOrder } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId is required' });

    // Validate pagination
    const { error, value } = paginationSchema.validate({ page, limit, sortBy, sortOrder }, { stripUnknown: true });
    if (error) return res.status(400).json({ errors: error.details.map(d => d.message) });

    const products = await listProducts(companyId, {
      shopId,
      status,
      page: value.page,
      limit: value.limit,
      category,
      keyword,
      sortBy: value.sortBy,
      sortOrder: value.sortOrder
    });
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
    const { error, value } = catalogProductSchema.validate(req.body);
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
    const { error, value } = catalogProductSchema.validate(req.body);
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