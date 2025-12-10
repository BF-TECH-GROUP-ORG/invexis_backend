const debtService = require('./debtService');
const debtRepo = require('../repositories/debtRepository');
const repaymentRepo = require('../repositories/repaymentRepository');
const mongoose = require('mongoose');

async function companyAnalytics(opts) {
    return debtService.companyAnalytics(opts);
}

async function shopAnalytics(opts) {
    return debtService.shopAnalytics(opts);
}

async function customerAnalytics(opts) {
    return debtService.customerAnalytics(opts);
}

// Additional analytics helpers
async function agingBuckets({ companyId }) {
    const match = { companyId: mongoose.Types.ObjectId(companyId), isDeleted: false };
    const now = new Date();
    const debts = await debtRepo.listDebts(match, { skip: 0, limit: 10000 });
    const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    for (const d of debts) {
        if (!d.createdAt) continue;
        const age = Math.floor((now - new Date(d.createdAt)) / (1000 * 60 * 60 * 24));
        if (age <= 30) buckets['0-30'] += d.balance || 0;
        else if (age <= 60) buckets['31-60'] += d.balance || 0;
        else if (age <= 90) buckets['61-90'] += d.balance || 0;
        else buckets['90+'] += d.balance || 0;
    }
    return buckets;
}

module.exports = { companyAnalytics, shopAnalytics, customerAnalytics, agingBuckets };
