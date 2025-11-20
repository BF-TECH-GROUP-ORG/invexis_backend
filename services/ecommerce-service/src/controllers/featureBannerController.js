// // controllers/FeaturedBannerController.js
// const FeaturedBanner = require('../models/FeaturedBanner.models');
// // const mongoose = require('mongoose');

// // Helper function to validate dates
// const validateDates = (startAt, endAt) => {
//   const now = new Date();
//   const start = startAt ? new Date(startAt) : now;
//   const end = endAt ? new Date(endAt) : null;

//   if (start > now) {
//     throw new Error('startAt cannot be in the future for active banners');
//   }
//   if (end && end <= start) {
//     throw new Error('endAt must be after startAt');
//   }
//   if (end && end < now) {
//     throw new Error('endAt cannot be in the past if banner is active');
//   }
//   return { startAt: start, endAt: end };
// };

// // Helper to build query for active banners
// const buildActiveQuery = (companyId, shopId, type, currentDate = new Date()) => {
//   const query = {
//     companyId,
//     isActive: true,
//     isDeleted: false,
//     $or: [
//       { startAt: { $lte: currentDate } },
//       { startAt: { $exists: false } }
//     ]
//   };
//   if (shopId) query.shopId = shopId;
//   if (type) query.type = type;
//   if (endAt) query.endAt = { $gte: currentDate };
//   return query;
// };

// // Create a new featured banner
// const createBanner = async (req, res) => {
//   try {
//     const { companyId, shopId, title, subtitle, imageUrl, target, type, priority, startAt, endAt } = req.body;

//     // Validation
//     if (!companyId || !title || !imageUrl) {
//       return res.status(400).json({ success: false, message: 'companyId, title, and imageUrl are required' });
//     }

//     // Validate LocalizedString (assuming structure { en: String, ... })
//     if (typeof title !== 'object' || !title.en) {
//       return res.status(400).json({ success: false, message: 'title must be a LocalizedString object with at least "en" key' });
//     }
//     if (subtitle && typeof subtitle !== 'object') {
//       return res.status(400).json({ success: false, message: 'subtitle must be a LocalizedString object or null' });
//     }

//     // Validate target
//     if (!target || typeof target !== 'object') {
//       return res.status(400).json({ success: false, message: 'target must be an object (e.g., { type: "product", id: "..." } or { url: "..." })' });
//     }

//     // Validate type enum
//     const validTypes = ['homepage', 'seasonal', 'product_highlight'];
//     if (type && !validTypes.includes(type)) {
//       return res.status(400).json({ success: false, message: `type must be one of: ${validTypes.join(', ')}` });
//     }

//     // Generate unique bannerId if not provided
//     const bannerId = req.body.bannerId || `banner_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

//     // Validate dates
//     const dates = validateDates(startAt, endAt);

//     const bannerData = {
//       bannerId,
//       companyId,
//       shopId,
//       title,
//       subtitle,
//       imageUrl,
//       target,
//       type: type || 'homepage',
//       priority: priority || 0,
//       startAt: dates.startAt,
//       endAt: dates.endAt,
//       isActive: true,
//       isDeleted: false
//     };

//     // Check for duplicate bannerId
//     const existing = await FeaturedBanner.findOne({ bannerId });
//     if (existing) {
//       return res.status(409).json({ success: false, message: 'bannerId already exists' });
//     }

//     const banner = new FeaturedBanner(bannerData);
//     await banner.save();

//     res.status(201).json({ success: true, data: banner, message: 'Banner created successfully' });
//   } catch (error) {
//     console.error('Create Banner Error:', error);
//     res.status(500).json({ success: false, message: error.message || 'Internal server error' });
//   }
// };

// // Get list of banners (with filtering, pagination, active ones prioritized)
// const getBanners = async (req, res) => {
//   try {
//     const { companyId, shopId, type, active, page = 1, limit = 10, sortBy = 'priority', sortDir = 'desc' } = req.query;

//     if (!companyId) {
//       return res.status(400).json({ success: false, message: 'companyId is required' });
//     }

//     const query = { companyId, isDeleted: false };
//     if (shopId) query.shopId = shopId;
//     if (type) query.type = type;
//     if (active === 'true') {
//       query.isActive = true;
//       query.$or = [
//         { startAt: { $lte: new Date() } },
//         { startAt: { $exists: false } }
//       ];
//       query.endAt = { $gte: new Date() };
//     }

//     const sortOptions = {};
//     sortOptions[sortBy] = sortDir === 'desc' ? -1 : 1;

//     const banners = await FeaturedBanner
//       .find(query)
//       .sort(sortOptions)
//       .limit(parseInt(limit))
//       .skip((parseInt(page) - 1) * parseInt(limit))
//       .lean(); // Use lean for performance

//     const total = await FeaturedBanner.countDocuments(query);

//     res.status(200).json({
//       success: true,
//       data: banners,
//       pagination: {
//         page: parseInt(page),
//         limit: parseInt(limit),
//         total,
//         pages: Math.ceil(total / parseInt(limit))
//       },
//       message: 'Banners retrieved successfully'
//     });
//   } catch (error) {
//     console.error('Get Banners Error:', error);
//     res.status(500).json({ success: false, message: error.message || 'Internal server error' });
//   }
// };

// // Get single banner by bannerId
// const getBannerById = async (req, res) => {
//   try {
//     const { bannerId, companyId } = req.params;

//     if (!companyId || !bannerId) {
//       return res.status(400).json({ success: false, message: 'companyId and bannerId are required' });
//     }

//     const banner = await FeaturedBanner.findOne({ bannerId, companyId, isDeleted: false }).lean();
//     if (!banner) {
//       return res.status(404).json({ success: false, message: 'Banner not found' });
//     }

//     res.status(200).json({ success: true, data: banner, message: 'Banner retrieved successfully' });
//   } catch (error) {
//     console.error('Get Banner Error:', error);
//     res.status(500).json({ success: false, message: error.message || 'Internal server error' });
//   }
// };

// // Update banner
// const updateBanner = async (req, res) => {
//   try {
//     const { bannerId, companyId } = req.params;
//     const updateData = req.body;

//     if (!companyId || !bannerId) {
//       return res.status(400).json({ success: false, message: 'companyId and bannerId are required' });
//     }

//     // Validate optional updates
//     if (updateData.title && typeof updateData.title !== 'object') {
//       return res.status(400).json({ success: false, message: 'title must be a LocalizedString object' });
//     }
//     if (updateData.subtitle && typeof updateData.subtitle !== 'object') {
//       return res.status(400).json({ success: false, message: 'subtitle must be a LocalizedString object' });
//     }
//     if (updateData.target && typeof updateData.target !== 'object') {
//       return res.status(400).json({ success: false, message: 'target must be an object' });
//     }
//     if (updateData.startAt || updateData.endAt) {
//       const dates = validateDates(updateData.startAt, updateData.endAt);
//       updateData.startAt = dates.startAt;
//       updateData.endAt = dates.endAt;
//     }

//     const banner = await FeaturedBanner.findOneAndUpdate(
//       { bannerId, companyId, isDeleted: false },
//       { $set: updateData },
//       { new: true, runValidators: true }
//     );

//     if (!banner) {
//       return res.status(404).json({ success: false, message: 'Banner not found' });
//     }

//     res.status(200).json({ success: true, data: banner, message: 'Banner updated successfully' });
//   } catch (error) {
//     console.error('Update Banner Error:', error);
//     res.status(500).json({ success: false, message: error.message || 'Internal server error' });
//   }
// };

// // Soft delete banner
// const deleteBanner = async (req, res) => {
//   try {
//     const { bannerId, companyId } = req.params;

//     if (!companyId || !bannerId) {
//       return res.status(400).json({ success: false, message: 'companyId and bannerId are required' });
//     }

//     const banner = await FeaturedBanner.findOneAndUpdate(
//       { bannerId, companyId, isDeleted: false },
//       { isDeleted: true },
//       { new: true }
//     );

//     if (!banner) {
//       return res.status(404).json({ success: false, message: 'Banner not found' });
//     }

//     res.status(200).json({ success: true, message: 'Banner deleted successfully' });
//   } catch (error) {
//     console.error('Delete Banner Error:', error);
//     res.status(500).json({ success: false, message: error.message || 'Internal server error' });
//   }
// };

// // Toggle banner active status
// const toggleActive = async (req, res) => {
//   try {
//     const { bannerId, companyId } = req.params;
//     const { isActive } = req.body;

//     if (!companyId || !bannerId) {
//       return res.status(400).json({ success: false, message: 'companyId and bannerId are required' });
//     }
//     if (typeof isActive !== 'boolean') {
//       return res.status(400).json({ success: false, message: 'isActive must be a boolean' });
//     }

//     const banner = await FeaturedBanner.findOneAndUpdate(
//       { bannerId, companyId, isDeleted: false },
//       { isActive },
//       { new: true }
//     );

//     if (!banner) {
//       return res.status(404).json({ success: false, message: 'Banner not found' });
//     }

//     res.status(200).json({ success: true, data: banner, message: 'Banner status updated successfully' });
//   } catch (error) {
//     console.error('Toggle Active Error:', error);
//     res.status(500).json({ success: false, message: error.message || 'Internal server error' });
//   }
// };

// module.exports = {
//   createBanner,
//   getBanners,
//   getBannerById,
//   updateBanner,
//   deleteBanner,
//   toggleActive
// };


const { createBanner, getBanners, getBannerById, updateBanner, deleteBanner, toggleActive } = require('../services/bannerService');
const { bannerSchema } = require('../utils/app');

exports.createBanner = async (req, res) => {
  try {
    const { error, value } = bannerSchema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details.map(d => d.message).join(', ') });
    const { companyId } = req.user;
    const banner = await createBanner(companyId, value);
    res.status(201).json({ success: true, data: banner, message: 'Banner created successfully' });
  } catch (error) {
    console.error('Create Banner Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getBanners = async (req, res) => {
  try {
    const { companyId, shopId, type, active, page, limit, sortBy, sortDir } = req.query;
    if (!companyId) return res.status(400).json({ success: false, message: 'companyId is required' });
    const banners = await getBanners(companyId, { shopId, type, active, page, limit, sortBy, sortDir });
    res.status(200).json({ success: true, data: banners.banners, pagination: banners.pagination, message: 'Banners retrieved successfully' });
  } catch (error) {
    console.error('Get Banners Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getBannerById = async (req, res) => {
  try {
    const { bannerId, companyId } = req.params;
    if (!companyId || !bannerId) return res.status(400).json({ success: false, message: 'companyId and bannerId are required' });
    const banner = await getBannerById(bannerId, companyId);
    res.status(200).json({ success: true, data: banner, message: 'Banner retrieved successfully' });
  } catch (error) {
    console.error('Get Banner Error:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({ success: false, message: error.message });
  }
};

exports.updateBanner = async (req, res) => {
  try {
    const { bannerId, companyId } = req.params;
    const { error, value } = bannerSchema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details.map(d => d.message).join(', ') });
    if (!companyId || !bannerId) return res.status(400).json({ success: false, message: 'companyId and bannerId are required' });
    const banner = await updateBanner(bannerId, companyId, value);
    res.status(200).json({ success: true, data: banner, message: 'Banner updated successfully' });
  } catch (error) {
    console.error('Update Banner Error:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({ success: false, message: error.message });
  }
};

exports.deleteBanner = async (req, res) => {
  try {
    const { bannerId, companyId } = req.params;
    if (!companyId || !bannerId) return res.status(400).json({ success: false, message: 'companyId and bannerId are required' });
    const result = await deleteBanner(bannerId, companyId);
    res.status(200).json({ success: true, message: 'Banner deleted successfully' });
  } catch (error) {
    console.error('Delete Banner Error:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({ success: false, message: error.message });
  }
};

exports.toggleActive = async (req, res) => {
  try {
    const { bannerId, companyId } = req.params;
    const { isActive } = req.body;
    if (!companyId || !bannerId) return res.status(400).json({ success: false, message: 'companyId and bannerId are required' });
    if (typeof isActive !== 'boolean') return res.status(400).json({ success: false, message: 'isActive must be a boolean' });
    const banner = await toggleActive(bannerId, companyId, isActive);
    res.status(200).json({ success: true, data: banner, message: 'Banner status updated successfully' });
  } catch (error) {
    console.error('Toggle Active Error:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({ success: false, message: error.message });
  }
};