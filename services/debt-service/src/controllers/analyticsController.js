const analyticsService = require('../services/analyticsService');

async function companyAnalytics(req, res) {
    try {
        const companyId = req.params.companyId || req.headers['x-company-id'];
        if (!companyId) return res.status(400).json({ error: 'companyId required' });
        const data = await analyticsService.companyAnalytics({ companyId });
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

async function shopAnalytics(req, res) {
    try {
        const shopId = req.params.shopId;
        const data = await analyticsService.shopAnalytics({ shopId });
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

async function customerAnalytics(req, res) {
    try {
        const hashedCustomerId = req.params.customerId;
        const companyId = req.query.companyId || req.headers['x-company-id'];
        const data = await analyticsService.customerAnalytics({ companyId, hashedCustomerId });
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

async function agingBuckets(req, res) {
    try {
        const companyId = req.params.companyId || req.headers['x-company-id'];
        const data = await analyticsService.agingBuckets({ companyId });
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

module.exports = { companyAnalytics, shopAnalytics, customerAnalytics, agingBuckets };
// --- Summary endpoints ---
const summaryRepo = require('../repositories/summaryRepository');
const crossCompanyRepo = require('../repositories/crossCompanyRepository');

async function companySummary(req, res) {
    try {
        const companyId = req.params.companyId;
        if (!companyId) return res.status(400).json({ error: 'companyId required' });
        const summary = await summaryRepo.findCompanySummary(companyId);
        res.json({ summary });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

async function shopSummary(req, res) {
    try {
        const shopId = req.params.shopId;
        if (!shopId) return res.status(400).json({ error: 'shopId required' });
        const summary = await summaryRepo.findShopSummary(shopId);
        res.json({ summary });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

async function customerSummary(req, res) {
    try {
        const hashedCustomerId = req.params.customerId;
        if (!hashedCustomerId) return res.status(400).json({ error: 'customerId required' });
        const summary = await summaryRepo.findCustomerSummary(hashedCustomerId);
        res.json({ summary });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

async function crossCompanySummary(req, res) {
    try {
        const hashedCustomerId = req.params.hashedCustomerId;
        if (!hashedCustomerId) return res.status(400).json({ error: 'hashedCustomerId required' });
        const summary = await crossCompanyRepo.findByHashedCustomerId(hashedCustomerId);
        res.json({ summary });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

module.exports.companySummary = companySummary;
module.exports.shopSummary = shopSummary;
module.exports.customerSummary = customerSummary;
module.exports.crossCompanySummary = crossCompanySummary;
