const searchService = require('../services/searchService');
const logger = require('../utils/logger');
const { paginationSchema } = require('../utils/app');

exports.searchProducts = async (req, res, next) => {
    try {
        const companyId = req.user?.companyId || req.query.companyId;
        if (!companyId) {
            return res.status(400).json({ success: false, message: 'Company ID is required' });
        }

        const { page, limit, sortBy, sortOrder } = req.query;
        const { error, value } = paginationSchema.validate({ page, limit, sortBy, sortOrder }, { stripUnknown: true });
        if (error) return res.status(400).json({ success: false, message: error.details.map(d => d.message).join(', ') });

        const results = await searchService.searchProducts(companyId, { ...req.query, page: value.page, limit: value.limit, sortBy: value.sortBy, sortOrder: value.sortOrder });
        res.json({ success: true, data: results });
    } catch (error) {
        logger.error('Error in searchProducts:', error);
        next(error);
    }
};

exports.getFilterOptions = async (req, res, next) => {
    try {
        const companyId = req.user?.companyId || req.query.companyId;
        const category = req.query.category;
        const filters = await searchService.getFilterOptions(companyId, category);
        res.json({ success: true, data: filters });
    } catch (error) {
        logger.error('Error in getFilterOptions:', error);
        next(error);
    }
};

exports.autocomplete = async (req, res, next) => {
    try {
        const { query } = req.query;
        const companyId = req.user?.companyId || req.query.companyId;
        const limit = parseInt(req.query.limit) || 10;
        const suggestions = await searchService.autocomplete(companyId, query, limit);
        res.json({ success: true, data: { suggestions } });
    } catch (error) {
        logger.error('Error in autocomplete:', error);
        next(error);
    }
};
