const SalesDocument = require('../models/SalesDocument');
const SalesReport = require('../models/SalesReport');
const logger = require('../config/logger');

/**
 * Helper to fetch documents with standard pagination and filtering
 */
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
 * Sales Controller
 * Manages Customer Invoices and Aggregated Sales Reports
 */

// --- 1. Invoices (Individual Receipts) ---

exports.getCompanyInvoices = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { page = 1, limit = 20, type, startDate, endDate } = req.query;
        const query = { 'owner.companyId': companyId };

        if (type) query.type = type;
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        const { data, total } = await fetchDocs(SalesDocument, query, page, limit);
        res.json({ success: true, data, pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) } });
    } catch (error) {
        logger.error('Error fetching company invoices:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch company invoices' });
    }
};

exports.getShopInvoices = async (req, res) => {
    try {
        const { shopId } = req.params;
        const { companyId, page = 1, limit = 20, type, startDate, endDate } = req.query;
        const query = { 'owner.shopId': shopId };
        if (companyId) query['owner.companyId'] = companyId;

        if (type) query.type = type;
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        const { data, total } = await fetchDocs(SalesDocument, query, page, limit);
        res.json({ success: true, data, pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) } });
    } catch (error) {
        logger.error('Error fetching shop invoices:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch shop invoices' });
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

        const { data, total } = await fetchDocs(SalesReport, query, page, limit);
        res.json({ success: true, data, pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) } });
    } catch (error) {
        logger.error('Error fetching company sales reports:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch company sales reports' });
    }
};

exports.getShopReports = async (req, res) => {
    try {
        const { shopId } = req.params;
        const { companyId, page = 1, limit = 20, startDate, endDate } = req.query;
        const query = { 'filters.branchId': shopId }; // Mapping shopId to branchId filter
        if (companyId) query['owner.companyId'] = companyId;

        if (startDate || endDate) {
            query['period.start'] = {};
            if (startDate) query['period.start'].$gte = new Date(startDate);
            if (endDate) query['period.start'].$lte = new Date(endDate);
        }

        const { data, total } = await fetchDocs(SalesReport, query, page, limit);
        res.json({ success: true, data, pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) } });
    } catch (error) {
        logger.error('Error fetching shop sales reports:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch shop sales reports' });
    }
};
