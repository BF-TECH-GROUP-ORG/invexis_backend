const debtService = require('./debtService');
const debtRepo = require('../repositories/debtRepository');
const repaymentRepo = require('../repositories/repaymentRepository');
const mongoose = require('mongoose');
const Debt = require('../models/debt.model');

async function companyAnalytics(opts) {
    return debtService.companyAnalytics(opts);
}

async function shopAnalytics(opts) {
    return debtService.shopAnalytics(opts);
}

async function customerAnalytics(opts) {
    return debtService.customerAnalytics(opts);
}

// Additional analytics helpers - Use MongoDB aggregation for better performance
async function agingBuckets({ companyId }) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    try {
        const companyObjectId = typeof companyId === 'string' && companyId.length === 24 
            ? mongoose.Types.ObjectId(companyId) 
            : companyId;

        const result = await Debt.aggregate([
            {
                $match: {
                    companyId: companyObjectId,
                    isDeleted: false
                }
            },
            {
                $facet: {
                    '0-30': [
                        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
                        { $group: { _id: null, total: { $sum: '$balance' } } }
                    ],
                    '31-60': [
                        { $match: { createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } } },
                        { $group: { _id: null, total: { $sum: '$balance' } } }
                    ],
                    '61-90': [
                        { $match: { createdAt: { $gte: ninetyDaysAgo, $lt: sixtyDaysAgo } } },
                        { $group: { _id: null, total: { $sum: '$balance' } } }
                    ],
                    '90+': [
                        { $match: { createdAt: { $lt: ninetyDaysAgo } } },
                        { $group: { _id: null, total: { $sum: '$balance' } } }
                    ]
                }
            }
        ]);

        const buckets = {
            '0-30': result[0]['0-30'][0]?.total || 0,
            '31-60': result[0]['31-60'][0]?.total || 0,
            '61-90': result[0]['61-90'][0]?.total || 0,
            '90+': result[0]['90+'][0]?.total || 0
        };
        return buckets;
    } catch (err) {
        console.error('Error computing aging buckets:', err);
        return { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    }
}

module.exports = { companyAnalytics, shopAnalytics, customerAnalytics, agingBuckets };
