const { createBanner, getBanners, getBannerById, updateBanner, deleteBanner, toggleActive } = require('../services/bannerService');
const { bannerSchema, paginationSchema } = require('../utils/app');

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

    const { error, value } = paginationSchema.validate({ page, limit, sortBy, sortOrder: sortDir }, { stripUnknown: true });
    if (error) return res.status(400).json({ success: false, message: error.details.map(d => d.message).join(', ') });

    const banners = await getBanners(companyId, {
      shopId,
      type,
      active,
      page: value.page,
      limit: value.limit,
      sortBy: value.sortBy,
      sortDir: value.sortOrder
    });
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