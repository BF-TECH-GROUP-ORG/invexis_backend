const FinanceReport = require('../models/FinanceReport');
const logger = require('../config/logger');

const fetchDocs = async (Model, query, page, limit) => {
    const skip = (page - 1) * parseInt(limit);
    const data = await Model.find(query)
        .sort({ 'period.start': -1 })
        .skip(skip)
        .limit(parseInt(limit));
    const total = await Model.countDocuments(query);
    return { data, total };
};

exports.getCompanyReports = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { page = 1, limit = 20, type, startDate, endDate } = req.query;
        const query = { 'owner.companyId': companyId };
        if (type) query.type = type;

        if (startDate || endDate) {
            query['period.start'] = {};
            if (startDate) query['period.start'].$gte = new Date(startDate);
            if (endDate) query['period.start'].$lte = new Date(endDate);
        }

        const { data, total } = await fetchDocs(FinanceReport, query, page, limit);
        res.json({ success: true, data, pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) } });
    } catch (error) {
        logger.error('Error fetching company finance reports:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch company finance reports' });
    }
};

exports.getShopReports = async (req, res) => {
    try {
        const { shopId } = req.params;
        const { companyId, page = 1, limit = 20, type, startDate, endDate } = req.query;
        const query = { 'owner.shopId': shopId };
        if (companyId) query['owner.companyId'] = companyId;
        if (type) query.type = type;

        if (startDate || endDate) {
            query['period.start'] = {};
            if (startDate) query['period.start'].$gte = new Date(startDate);
            if (endDate) query['period.start'].$lte = new Date(endDate);
        }

        const { data, total } = await fetchDocs(FinanceReport, query, page, limit);
        res.json({ success: true, data, pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) } });
    } catch (error) {
        logger.error('Error fetching shop finance reports:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch shop finance reports' });
    }
};
