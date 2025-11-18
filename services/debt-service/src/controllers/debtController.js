const debtService = require('../services/debtService');

async function createDebt(req, res) {
    try {
        // enforce multi-tenancy
        const companyId = req.body.companyId || req.headers['x-company-id'];
        if (!companyId) return res.status(400).json({ error: 'companyId required' });

        const payload = { ...req.body, companyId };
        const debt = await debtService.createDebt(payload);
        res.status(201).json({ debt });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

async function recordRepayment(req, res) {
    try {
        const companyId = req.body.companyId || req.headers['x-company-id'];
        if (!companyId) return res.status(400).json({ error: 'companyId required' });

        const payload = { ...req.body, companyId };
        const result = await debtService.recordRepayment(payload);
        res.status(201).json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

async function getDebt(req, res) {
    try {
        const companyId = req.params.companyId || req.headers['x-company-id'];
        const debtId = req.params.debtId;
        if (!companyId) return res.status(400).json({ error: 'companyId required' });
        const debt = await debtService.getDebtWithRepayments({ companyId, debtId });
        res.json({ debt });
    } catch (err) {
        console.error(err);
        res.status(404).json({ error: err.message });
    }
}

async function listCompanyDebts(req, res) {
    try {
        const companyId = req.params.companyId || req.headers['x-company-id'];
        if (!companyId) return res.status(400).json({ error: 'companyId required' });
        const { shopId, status, page, limit } = req.query;
        const result = await debtService.listDebts({ companyId, shopId, status, page: Number(page) || 1, limit: Number(limit) || 50 });
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

async function listShopDebts(req, res) {
    try {
        const shopId = req.params.shopId;
        const companyId = req.query.companyId || req.headers['x-company-id'];
        if (!companyId) return res.status(400).json({ error: 'companyId required' });
        const result = await debtService.listDebts({ companyId, shopId });
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

async function listCustomerDebts(req, res) {
    try {
        const customerId = req.params.customerId;
        const companyId = req.query.companyId || req.headers['x-company-id'];
        if (!companyId) return res.status(400).json({ error: 'companyId required' });
        const result = await debtService.listDebts({ companyId, customerId });
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

async function companyAnalytics(req, res) {
    try {
        const companyId = req.params.companyId || req.headers['x-company-id'];
        if (!companyId) return res.status(400).json({ error: 'companyId required' });
        const data = await debtService.companyAnalytics({ companyId });
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

async function shopAnalytics(req, res) {
    try {
        const shopId = req.params.shopId;
        const data = await debtService.shopAnalytics({ shopId });
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
        const data = await debtService.customerAnalytics({ companyId, customerId });
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

async function crossCompanyCustomerDebts(req, res) {
    try {
        const hashedId = req.params.hashedId;
        const requestingCompanyId = req.query.companyId || req.headers['x-company-id'];
        if (!hashedId) return res.status(400).json({ error: 'hashedCustomerId required' });
        const results = await require('../services/debtService').crossCompanyCustomerDebts({ hashedCustomerId: hashedId, requestingCompanyId });
        res.json({ debts: results });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

async function updateDebt(req, res) {
    try {
        const companyId = req.body.companyId || req.headers['x-company-id'];
        const debtId = req.params.debtId;
        if (!companyId) return res.status(400).json({ error: 'companyId required' });
        if (!debtId) return res.status(400).json({ error: 'debtId required' });

        const result = await debtService.updateDebt({ companyId, debtId, updates: req.body });
        res.json({ debt: result });
    } catch (err) {
        console.error(err);
        res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
    }
}

async function softDeleteDebt(req, res) {
    try {
        const companyId = req.query.companyId || req.headers['x-company-id'];
        const debtId = req.params.debtId;
        if (!companyId) return res.status(400).json({ error: 'companyId required' });
        if (!debtId) return res.status(400).json({ error: 'debtId required' });

        const result = await debtService.softDeleteDebt({ companyId, debtId });
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
    }
}

module.exports = {
    createDebt,
    recordRepayment,
    getDebt,
    listCompanyDebts,
    listShopDebts,
    listCustomerDebts,
    companyAnalytics,
    shopAnalytics,
    customerAnalytics
    ,
    crossCompanyCustomerDebts,
    updateDebt,
    softDeleteDebt
};
