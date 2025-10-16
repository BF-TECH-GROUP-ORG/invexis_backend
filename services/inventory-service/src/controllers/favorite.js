const asyncHandler = require('express-async-handler');
const Favorite = require('../models/Favorite');
const { validateMongoId } = require('../utils/validator');

const addFavorite = asyncHandler(async (req, res) => {
  const { productId } = req.body;
  validateMongoId(productId);
  const favorite = new Favorite({ companyId: req.user.companyId, userId: req.user._id, productId });
  await favorite.save();
  res.status(201).json({ success: true, data: favorite });
});

const removeFavorite = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  validateMongoId(productId);
  const deleted = await Favorite.deleteOne({ companyId: req.user.companyId, userId: req.user._id, productId });
  if (deleted.deletedCount === 0) throw new Error('Favorite not found');
  res.json({ success: true, message: 'Favorite removed' });
});

const getFavorites = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const { favorites, total } = await Favorite.getUserFavorites(req.user._id, req.user.companyId, parseInt(page, 10), parseInt(limit, 10));
  res.json({ success: true, data: favorites, pagination: { page: parseInt(page, 10), limit: parseInt(limit, 10), total } });
});

module.exports = { addFavorite, removeFavorite, getFavorites };