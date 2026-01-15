const SalesDocument = require('../models/SalesDocument');
const InventoryDocument = require('../models/InventoryDocument');
const ReportDocument = require('../models/ReportDocument');
const CompanyDocument = require('../models/CompanyDocument');
const logger = require('../config/logger');

// Helper to get model by category
const getModelByCategory = (category) => {
    switch (category) {
        case 'inventory': return InventoryDocument;
        case 'report': return ReportDocument;
        case 'company': return CompanyDocument;
        case 'sales':
        case 'invoice':
        case 'receipt': return SalesDocument;
        default: return SalesDocument; // Default to Sales for backward compatibility
    }
};

const getDocuments = async (req, res) => {
    try {
        const { companyId, shopId, type, category, page = 1, limit = 20 } = req.query;
        const targetCategory = category || req.params.category || 'sales';
        const Model = getModelByCategory(targetCategory);

        // Build query
        const query = {};

        if (companyId) {
            query['owner.companyId'] = companyId;
        } else if (req.params.companyId) {
            query['owner.companyId'] = req.params.companyId;
        }

        if (shopId) query['owner.shopId'] = shopId;
        if (type) query.type = type;

        const skip = (page - 1) * parseInt(limit);

        const documents = await Model.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Model.countDocuments(query);

        res.json({
            success: true,
            data: documents,
            category: targetCategory,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        logger.error('Error fetching documents:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch documents' });
    }
};

const getDocumentById = async (req, res) => {
    try {
        const { id } = req.params;
        const { category } = req.query;

        let doc = null;
        if (category) {
            const Model = getModelByCategory(category);
            doc = await Model.findOne({ documentId: id });
        } else {
            // Polymorphic search across all models if category is unknown
            const models = [SalesDocument, InventoryDocument, ReportDocument, CompanyDocument];
            const results = await Promise.all(models.map(m => m.findOne({ documentId: id })));
            doc = results.find(r => r !== null);
        }

        if (!doc) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }
        res.json({ success: true, data: doc });
    } catch (error) {
        logger.error('Error fetching document:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch document' });
    }
};

module.exports = {
    getDocuments,
    getDocumentById
};
