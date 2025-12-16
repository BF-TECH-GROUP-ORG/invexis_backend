const CustomerSummary = require('../models/customer_summery.model');
const ShopSummary = require('../models/shop_summery.model');
const CompanySummary = require('../models/company_summery.model');

// Customer summaries are keyed by companyId + hashedCustomerId
async function upsertCustomerOnCreate({ companyId, hashedCustomerId, totalAmount, amountPaidNow }) {
    const outstanding = totalAmount - amountPaidNow;
    return CustomerSummary.findOneAndUpdate(
        { companyId, hashedCustomerId },
        {
            $inc: {
                totalDebts: 1,
                activeDebts: (outstanding > 0) ? 1 : 0,
                paidDebts: (outstanding <= 0) ? 1 : 0,
                totalOutstanding: outstanding,
                totalRepaid: amountPaidNow
            },
            $max: { largestDebt: totalAmount },
            $set: { updatedAt: new Date() }
        },
        { upsert: true, new: true }
    );
}

async function updateCustomerOnRepayment({ companyId, hashedCustomerId, amountPaid }) {
    return CustomerSummary.findOneAndUpdate(
        { companyId, hashedCustomerId },
        {
            $inc: { totalOutstanding: -amountPaid, totalRepaid: amountPaid },
            $set: { lastPaymentDate: new Date(), updatedAt: new Date() }
        },
        { upsert: true, new: true }
    );
}

async function upsertShopOnCreate({ companyId, shopId, totalAmount, amountPaidNow }) {
    const outstanding = totalAmount - amountPaidNow;
    return ShopSummary.findOneAndUpdate(
        { companyId, shopId },
        {
            $inc: {
                totalOutstanding: outstanding,
                numberOfActiveDebts: (outstanding > 0) ? 1 : 0,
                totalDebtCreatedThisMonth: totalAmount
            },
            $set: { updatedAt: new Date() }
        },
        { upsert: true, new: true }
    );
}

async function updateShopOnRepayment({ companyId, shopId, amountPaid }) {
    return ShopSummary.findOneAndUpdate(
        { companyId, shopId },
        {
            $inc: { totalOutstanding: -amountPaid, totalRepaidThisMonth: amountPaid },
            $set: { updatedAt: new Date() }
        },
        { upsert: true, new: true }
    );
}

async function upsertCompanyOnCreate({ companyId, totalAmount, amountPaidNow }) {
    const outstanding = totalAmount - amountPaidNow;
    return CompanySummary.findOneAndUpdate(
        { companyId },
        {
            $inc: { totalOutstanding: outstanding, totalCreditSales: totalAmount },
            $set: { updatedAt: new Date() }
        },
        { upsert: true, new: true }
    );
}

async function updateCompanyOnRepayment({ companyId, amountPaid }) {
    return CompanySummary.findOneAndUpdate(
        { companyId },
        { $inc: { totalRepaid: amountPaid, totalOutstanding: -amountPaid }, $set: { updatedAt: new Date() } },
        { upsert: true, new: true }
    );
}

async function updateMonthlyTrend(companyId, monthKey, { newDebts = 0, repaid = 0, outstanding = 0 }) {
    // push or update month object
    const doc = await CompanySummary.findOne({ companyId });
    if (!doc) {
        const obj = {
            companyId,
            monthlyTrend: [{ month: monthKey, newDebts, repaid, outstanding }],
            updatedAt: new Date()
        };
        return CompanySummary.create(obj);
    }

    const idx = (doc.monthlyTrend || []).findIndex(m => m.month === monthKey);
    if (idx === -1) {
        doc.monthlyTrend = doc.monthlyTrend || [];
        doc.monthlyTrend.push({ month: monthKey, newDebts, repaid, outstanding });
    } else {
        doc.monthlyTrend[idx].newDebts += newDebts;
        doc.monthlyTrend[idx].repaid += repaid;
        doc.monthlyTrend[idx].outstanding = outstanding; // override with latest outstanding
    }
    doc.updatedAt = new Date();
    return doc.save();
}

// Simple find helpers used by analyticsController summary endpoints
async function findCompanySummary(companyId) {
    return CompanySummary.findOne({ companyId }).lean();
}

async function findShopSummary(shopId) {
    return ShopSummary.findOne({ shopId }).lean();
}

async function findCustomerSummary(hashedCustomerId) {
    return CustomerSummary.findOne({ hashedCustomerId }).lean();
}

module.exports = {
    upsertCustomerOnCreate,
    updateCustomerOnRepayment,
    upsertShopOnCreate,
    updateShopOnRepayment,
    upsertCompanyOnCreate,
    updateCompanyOnRepayment,
    findCompanySummary,
    findShopSummary,
    findCustomerSummary
};
