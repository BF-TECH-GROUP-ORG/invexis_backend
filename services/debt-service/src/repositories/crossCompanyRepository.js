const CrossCompanySummary = require('../models/cross_company_summary.model');

async function findByHashedCustomerId(hashedCustomerId) {
    if (!hashedCustomerId) return null;
    return CrossCompanySummary.findOne({ hashedCustomerId }).lean();
}

// Upsert on debt create: increment totals
async function upsertOnDebtCreate({ hashedCustomerId, amount = 0, companyId, createdAt }) {
    if (!hashedCustomerId) return null;
    const now = new Date();

    // Increment totals and add company to set
    const update = {
        $inc: { totalOutstanding: Number(amount) || 0, numActiveDebts: (Number(amount) || 0) > 0 ? 1 : 0 },
        $max: { largestDebt: Number(amount) || 0 },
        $set: { lastActivityAt: createdAt || now, lastUpdated: now },
        $addToSet: { companies: companyId ? String(companyId) : null }
    };

    // Apply update then rehydrate doc to compute derived fields (numCompaniesWithDebt, risk)
    let doc = await CrossCompanySummary.findOneAndUpdate({ hashedCustomerId }, update, { upsert: true, new: true });

    // sanitize companies array (may contain null if companyId missing)
    doc.companies = Array.isArray(doc.companies) ? doc.companies.filter(Boolean) : [];
    doc.numCompaniesWithDebt = doc.companies.length;

    // Simple risk scoring heuristic (can be tuned): combine outstanding, counts and largest debt
    const score = computeRiskScore({ totalOutstanding: doc.totalOutstanding, numActiveDebts: doc.numActiveDebts, largestDebt: doc.largestDebt });
    doc.riskScore = score;
    doc.riskLabel = score >= 75 ? 'HIGH' : (score >= 40 ? 'MEDIUM' : 'LOW');

    // Persist derived fields back
    await CrossCompanySummary.findOneAndUpdate(
        { hashedCustomerId },
        {
            $set: {
                numCompaniesWithDebt: doc.numCompaniesWithDebt,
                // worstShareLevel is now effectively always FULL, but we keep the field for compatibility
                worstShareLevel: 'FULL',
                riskScore: doc.riskScore,
                riskLabel: doc.riskLabel,
                companies: doc.companies
            }
        }
    );

    return await CrossCompanySummary.findOne({ hashedCustomerId }).lean();
}

async function updateOnRepayment({ hashedCustomerId, amountPaid, companyId, createdAt }) {
    if (!hashedCustomerId) return null;
    const now = new Date();
    const update = { $inc: { totalOutstanding: -(Number(amountPaid) || 0) }, $set: { lastActivityAt: createdAt || now, lastUpdated: now }, $addToSet: { companies: companyId ? String(companyId) : null } };
    let doc = await CrossCompanySummary.findOneAndUpdate({ hashedCustomerId }, update, { upsert: true, new: true });

    // sanitize companies
    doc.companies = Array.isArray(doc.companies) ? doc.companies.filter(Boolean) : [];
    doc.numCompaniesWithDebt = doc.companies.length;

    // Recompute risk and label after repayment
    const score = computeRiskScore({ totalOutstanding: doc.totalOutstanding, numActiveDebts: doc.numActiveDebts, largestDebt: doc.largestDebt });
    doc.riskScore = score;
    doc.riskLabel = score >= 75 ? 'HIGH' : (score >= 40 ? 'MEDIUM' : 'LOW');

    await CrossCompanySummary.findOneAndUpdate({ hashedCustomerId }, { $set: { numCompaniesWithDebt: doc.numCompaniesWithDebt, riskScore: doc.riskScore, riskLabel: doc.riskLabel, companies: doc.companies } });
    return await CrossCompanySummary.findOne({ hashedCustomerId }).lean();
}

// Simple risk scoring function: tunable heuristic. Returns 0-100.
function computeRiskScore({ totalOutstanding = 0, numActiveDebts = 0, largestDebt = 0 }) {
    // Normalize by some reasonable buckets (these constants can be tuned)
    const outstandingFactor = Math.min(60, (Number(totalOutstanding) / 100)); // each 100 adds 1 point up to cap
    const debtsFactor = Math.min(20, Number(numActiveDebts) * 5); // 5 points per active debt
    const largestFactor = Math.min(20, (Number(largestDebt) / 100));
    const raw = Math.round(outstandingFactor + debtsFactor + largestFactor);
    return Math.max(0, Math.min(100, raw));
}
module.exports = { findByHashedCustomerId, upsertOnDebtCreate, updateOnRepayment };
