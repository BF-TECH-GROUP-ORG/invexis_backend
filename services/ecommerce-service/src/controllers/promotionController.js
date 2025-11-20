// const Promotion = require('../models/Promition.models');

// // List promotions (all fields)
// exports.listPromotions = async (req, res) => {
//   try {
//     const { companyId, shopId, status = 'active' } = req.query;
//     const filter = { isDeleted: false };
//     if (companyId) filter.companyId = companyId;
//     if (shopId) filter.shopId = shopId;
//     if (status) filter.status = status;
//     const promotions = await Promotion.find(filter);
//     res.json(promotions.map(p => p.toObject()));
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// // Get promotion by id (all fields)
// exports.getPromotion = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const promotion = await Promotion.findOne({ promotionId: id, isDeleted: false });
//     if (!promotion) return res.status(404).json({ message: 'Promotion not found' });
//     res.json(promotion.toObject());
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// // Helper: Validate Promotion
// function validatePromotionBody(body, isUpdate = false) {
//   const errors = [];
//   if (!isUpdate) {
//     if (!body.promotionId || typeof body.promotionId !== 'string') errors.push('promotionId (string) is required');
//     if (!body.companyId || typeof body.companyId !== 'string') errors.push('companyId (string) is required');
//     if (!body.name || typeof body.name !== 'string') errors.push('name (string) is required');
//     if (!body.discountType || !['percentage','fixed','free_shipping'].includes(body.discountType)) errors.push('discountType is required and must be valid');
//     if (typeof body.discountValue !== 'number') errors.push('discountValue (number) is required');
//     if (!body.startAt || isNaN(Date.parse(body.startAt))) errors.push('startAt (date) is required');
//     if (!body.endAt || isNaN(Date.parse(body.endAt))) errors.push('endAt (date) is required');
//   }
//   if (body.shopId && typeof body.shopId !== 'string') errors.push('shopId must be string');
//   if (body.code && typeof body.code !== 'string') errors.push('code must be string');
//   if (body.description && typeof body.description !== 'string') errors.push('description must be string');
//   if (body.usageLimit && typeof body.usageLimit !== 'number') errors.push('usageLimit must be number');
//   if (body.usedCount && typeof body.usedCount !== 'number') errors.push('usedCount must be number');
//   if (body.perCustomerLimit && typeof body.perCustomerLimit !== 'number') errors.push('perCustomerLimit must be number');
//   if (body.constraints && typeof body.constraints !== 'object') errors.push('constraints must be object');
//   if (body.status && !['active','expired','disabled'].includes(body.status)) errors.push('status must be valid');
//   if (body.isDeleted !== undefined && typeof body.isDeleted !== 'boolean') errors.push('isDeleted must be boolean');
//   return errors;
// }
// // Create promotion (all fields)
// exports.createPromotion = async (req, res) => {
//   const errors = validatePromotionBody(req.body);
//   if (errors.length) return res.status(400).json({ errors });
//   try {
//     const promotion = new Promotion(req.body);
//     await promotion.save();
//     res.status(201).json(promotion.toObject());
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// };

// // Update promotion (all fields)
// exports.updatePromotion = async (req, res) => {
//   const errors = validatePromotionBody(req.body, true);
//   if (errors.length) return res.status(400).json({ errors });
//   try {
//     const { id } = req.params;
//     const promotion = await Promotion.findOneAndUpdate(
//       { promotionId: id, isDeleted: false },
//       req.body,
//       { new: true }
//     );
//     if (!promotion) return res.status(404).json({ message: 'Promotion not found' });
//     res.json(promotion.toObject());
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// };

// // Delete promotion (soft, all fields)
// exports.deletePromotion = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const promotion = await Promotion.findOneAndUpdate(
//       { promotionId: id, isDeleted: false },
//       { isDeleted: true },
//       { new: true }
//     );
//     if (!promotion) return res.status(404).json({ message: 'Promotion not found' });
//     res.json(promotion.toObject());
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// };


const { listPromotions, getPromotion, createPromotion, updatePromotion, deletePromotion } = require('../services/promotionService');
const { promotionSchema } = require('../utils/app');

exports.listPromotions = async (req, res) => {
  try {
    const { companyId, shopId, status, page, limit } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId is required' });
    const promotions = await listPromotions(companyId, { shopId, active: status === 'active', page, limit });
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
    const { companyId } = req.user;
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
    const { companyId } = req.user;
    const promotion = await updatePromotion(promotionId, companyId, value);
    res.json(promotion);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
  }
};

exports.deletePromotion = async (req, res) => {
  try {
    const { id: promotionId } = req.params;
    const { companyId } = req.user;
    const result = await deletePromotion(promotionId, companyId);
    res.json(result);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
  }
};