const SalesDocument = require('../models/SalesDocument');
const SalesReport = require('../models/SalesReport');
const DebtDocument = require('../models/DebtDocument');
const FinanceReport = require('../models/FinanceReport');
const InventoryDocument = require('../models/InventoryDocument');
const InventoryReport = require('../models/InventoryReport');
const PerformanceReport = require('../models/PerformanceReport');
const PaymentDocument = require('../models/PaymentDocument');
const CompanyDocument = require('../models/CompanyDocument');
const ReportDocument = require('../models/ReportDocument');
const logger = require('../config/logger');

// List of all active models for polymorphic search
const ALL_MODELS = [
    SalesDocument, SalesReport,
    DebtDocument,
    FinanceReport,
    InventoryDocument, InventoryReport,
    PerformanceReport,
    PaymentDocument,
    CompanyDocument,
    ReportDocument
];

/**
 * Unified Search across all document collections
 */
const searchAll = async (req, res) => {
    try {
        const { companyId, shopId, query: textQuery, page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * parseInt(limit);

        // Standard filter
        const filter = {};
        if (companyId) filter['owner.companyId'] = companyId;
        if (shopId) filter['owner.shopId'] = shopId;

        if (textQuery) {
            filter.$or = [
                { displayName: { $regex: textQuery, $options: 'i' } },
                { documentId: textQuery },
                { 'metadata.title': { $regex: textQuery, $options: 'i' } }
            ];
        }

        // We run queries across all models in parallel
        // For unified search with pagination, we would ideally use a shared collection or aggregation.
        // For now, we fetch a few from each to create a "mixed" view for global search.
        const results = await Promise.all(ALL_MODELS.map(model =>
            model.find(filter)
                .sort({ createdAt: -1 })
                .limit(parseInt(limit))
                .lean()
        ));

        const flattened = results.flat()
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, parseInt(limit));

        res.json({
            success: true,
            data: flattened,
            count: flattened.length
        });
    } catch (error) {
        logger.error('Error in unified search:', error);
        res.status(500).json({ success: false, message: 'Global search failed' });
    }
};

/**
 * Get Specific Document by ID (Polymorphic)
 * Searches through all 10 collections to find the matching ID.
 */
const getDocumentById = async (req, res) => {
    try {
        const { id } = req.params;

        // Run parallel lookups
        const lookups = await Promise.all(ALL_MODELS.map(model =>
            model.findOne({ documentId: id }).lean()
        ));

        const doc = lookups.find(r => r !== null);

        if (!doc) {
            return res.status(404).json({ success: false, message: 'Document not found across all collections' });
        }

        res.json({ success: true, data: doc });
    } catch (error) {
        logger.error(`Error fetching document ${req.params.id}:`, error);
        res.status(500).json({ success: false, message: 'Failed to fetch document' });
    }
};

module.exports = {
    searchAll,
    getDocumentById
};
