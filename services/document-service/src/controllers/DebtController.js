const DebtDocument = require('../models/DebtDocument');
const logger = require('../config/logger');

const fetchDocs = async (Model, query, page, limit) => {
    const skip = (page - 1) * parseInt(limit);
    const data = await Model.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));
    const total = await Model.countDocuments(query);
    return { data, total };
};

/**
 * Debt Controller
 * Manages Payment Receipts and Debt Aging Reports
 */

// --- 1. Receipts (Individual Payments) ---

exports.getCompanyReceipts = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { page = 1, limit = 20, customerId, startDate, endDate } = req.query;
        const query = { 'owner.companyId': companyId };

        if (customerId) query['reference.customerId'] = customerId;
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        const { data, total } = await fetchDocs(DebtDocument, query, page, limit);
        res.json({ success: true, data, pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) } });
    } catch (error) {
        logger.error('Error fetching company debt receipts:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch company receipts' });
    }
};

exports.getShopReceipts = async (req, res) => {
    try {
        const { shopId } = req.params;
        const { companyId, page = 1, limit = 20, customerId, startDate, endDate } = req.query;
        const query = { 'owner.shopId': shopId };
        if (companyId) query['owner.companyId'] = companyId;

        if (customerId) query['reference.customerId'] = customerId;
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        const { data, total } = await fetchDocs(DebtDocument, query, page, limit);
        res.json({ success: true, data, pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) } });
    } catch (error) {
        logger.error('Error fetching shop debt receipts:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch shop receipts' });
    }
};

// --- 2. Reports (Aggregated Data) ---

exports.getCompanyReports = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { page = 1, limit = 20, startDate, endDate } = req.query;
        const query = { 'owner.companyId': companyId };

        if (startDate || endDate) {
            query['period.start'] = {};
            if (startDate) query['period.start'].$gte = new Date(startDate);
            if (endDate) query['period.start'].$lte = new Date(endDate);
        }

        const { data, total } = await fetchDocs(DebtDocument, query, page, limit);
        res.json({ success: true, data, pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) } });
    } catch (error) {
        logger.error('Error fetching company debt reports:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch company debt reports' });
    }
};

exports.getShopReports = async (req, res) => {
    try {
        const { shopId } = req.params;
        const { companyId, page = 1, limit = 20, startDate, endDate } = req.query;
        const query = { 'owner.shopId': shopId };
        if (companyId) query['owner.companyId'] = companyId;

        if (startDate || endDate) {
            query['period.start'] = {};
            if (startDate) query['period.start'].$gte = new Date(startDate);
            if (endDate) query['period.start'].$lte = new Date(endDate);
        }

        const { data, total } = await fetchDocs(DebtDocument, query, page, limit);
        res.json({ success: true, data, pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) } });
    } catch (error) {
        logger.error('Error fetching shop debt reports:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch shop debt reports' });
    }
};
