const InventoryDocument = require('../models/InventoryDocument');
const InventoryReport = require('../models/InventoryReport');
const logger = require('../config/logger');

const fetchDocs = async (Model, query, page, limit) => {
    const skip = (page - 1) * parseInt(limit);
    const data = await Model.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    const total = await Model.countDocuments(query);
    return { data, total };
};

// --- 1. Media ---

exports.getCompanyMedia = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { page = 1, limit = 20, type } = req.query;
        const query = { 'owner.companyId': companyId };
        if (type) query.type = type;

        const { data, total } = await fetchDocs(InventoryDocument, query, page, limit);
        res.json({ success: true, data, pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) } });
    } catch (error) {
        logger.error('Error fetching company media:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch company media' });
    }
};

exports.getShopMedia = async (req, res) => {
    try {
        const { shopId } = req.params;
        const { companyId, page = 1, limit = 20, type } = req.query;
        const query = { 'owner.shopId': shopId };
        if (companyId) query['owner.companyId'] = companyId;
        if (type) query.type = type;

        const { data, total } = await fetchDocs(InventoryDocument, query, page, limit);
        res.json({ success: true, data, pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) } });
    } catch (error) {
        logger.error('Error fetching shop media:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch shop media' });
    }
};

// --- 2. Reports ---

exports.getCompanyReports = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { page = 1, limit = 20, category, startDate, endDate } = req.query;
        const query = { 'owner.companyId': companyId };
        if (category) query.category = category;

        if (startDate || endDate) {
            query['period.start'] = {};
            if (startDate) query['period.start'].$gte = new Date(startDate);
            if (endDate) query['period.start'].$lte = new Date(endDate);
        }

        const { data, total } = await fetchDocs(InventoryReport, query, page, limit);
        res.json({ success: true, data, pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) } });
    } catch (error) {
        logger.error('Error fetching company inventory reports:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch company inventory reports' });
    }
};

exports.getShopReports = async (req, res) => {
    try {
        const { shopId } = req.params;
        const { companyId, page = 1, limit = 20, category, startDate, endDate } = req.query;
        const query = { 'owner.shopId': shopId };
        if (companyId) query['owner.companyId'] = companyId;
        if (category) query.category = category;

        if (startDate || endDate) {
            query['period.start'] = {};
            if (startDate) query['period.start'].$gte = new Date(startDate);
            if (endDate) query['period.start'].$lte = new Date(endDate);
        }

        const { data, total } = await fetchDocs(InventoryReport, query, page, limit);
        res.json({ success: true, data, pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) } });
    } catch (error) {
        logger.error('Error fetching shop inventory reports:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch shop inventory reports' });
    }
};
