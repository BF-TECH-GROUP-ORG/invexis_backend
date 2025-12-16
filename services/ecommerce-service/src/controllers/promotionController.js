const { listPromotions, getPromotion, createPromotion, updatePromotion, deletePromotion } = require('../services/promotionService');
const { promotionSchema, paginationSchema } = require('../utils/app');

exports.listPromotions = async (req, res) => {
  try {
    const { companyId, status, page, limit } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId is required' });

    const { error, value } = paginationSchema.validate({ page, limit }, { stripUnknown: true });
    if (error) return res.status(400).json({ errors: error.details.map(d => d.message) });

    const promotions = await listPromotions(companyId, { active: status === 'active', page: value.page, limit: value.limit });
    res.json(promotions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getPromotion = async (req, res) => {
  try {
    const { id: promotionId } = req.params;
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId is required' });
    const promotion = await getPromotion(promotionId, companyId);
    res.json(promotion);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
};

exports.createPromotion = async (req, res) => {
  try {
    const { error, value } = promotionSchema.validate(req.body);
    if (error) return res.status(400).json({ errors: error.details.map(d => d.message) });
    const { companyId } = req.user || req.body;
    if (!companyId) return res.status(400).json({ error: 'companyId is required' });
    const promotion = await createPromotion(companyId, value);
    res.status(201).json(promotion);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.updatePromotion = async (req, res) => {
  try {
    const { error, value } = promotionSchema.validate(req.body);
    if (error) return res.status(400).json({ errors: error.details.map(d => d.message) });
    const { id: promotionId } = req.params;
    const { companyId } = req.user || req.body;
    if (!companyId) return res.status(400).json({ error: 'companyId is required' });
    const promotion = await updatePromotion(promotionId, companyId, value);
    res.json(promotion);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
  }
};

exports.deletePromotion = async (req, res) => {
  try {
    const { id: promotionId } = req.params;
    const { companyId } = req.user || req.body;
    if (!companyId) return res.status(400).json({ error: 'companyId is required' });
    const result = await deletePromotion(promotionId, companyId);
    res.json(result);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
  }
};