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
        const customerId = req.params.customerId;
        const companyId = req.query.companyId || req.headers['x-company-id'];
        const data = await analyticsService.customerAnalytics({ companyId, customerId });
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
