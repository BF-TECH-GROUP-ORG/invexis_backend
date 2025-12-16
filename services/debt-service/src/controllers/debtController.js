const debtService = require('../services/debtService');

async function createDebt(req, res) {
    try {
        // enforce multi-tenancy
        const companyId = req.body.companyId || req.headers['x-company-id'];
        if (!companyId) return res.status(400).json({ error: 'companyId required' });

        // Validate hashedCustomerId format if provided (sales-service should produce the hash)
        const { hashedCustomerId } = req.body || {};
        if (hashedCustomerId) {
            const { isValidHashedCustomerId } = require('../utils/hashedId');
            if (!isValidHashedCustomerId(hashedCustomerId)) {
                return res.status(400).json({ error: 'malformed hashedCustomerId' });
            }
        }

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
        if (!debtId) return res.status(400).json({ error: 'debtId required' });
        
        const debt = await debtService.getDebtWithRepayments({ companyId, debtId });
        res.json({ 
            debt,
            message: 'Debt retrieved successfully with payment history'
        });
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

// List paid debts for a company (convenience route)
async function listCompanyPaidDebts(req, res) {
    try {
        const companyId = req.params.companyId || req.headers['x-company-id'];
        if (!companyId) return res.status(400).json({ error: 'companyId required' });
        const { page, limit } = req.query;
        const result = await debtService.listDebts({ companyId, status: 'PAID', page: Number(page) || 1, limit: Number(limit) || 50 });
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

// List partially-paid debts for a company
async function listCompanyPartiallyPaidDebts(req, res) {
    try {
        const companyId = req.params.companyId || req.headers['x-company-id'];
        if (!companyId) return res.status(400).json({ error: 'companyId required' });
        const { page, limit } = req.query;
        const result = await debtService.listDebts({ companyId, status: 'PARTIALLY_PAID', page: Number(page) || 1, limit: Number(limit) || 50 });
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

// List unpaid debts for a company
async function listCompanyUnpaidDebts(req, res) {
    try {
        const companyId = req.params.companyId || req.headers['x-company-id'];
        if (!companyId) return res.status(400).json({ error: 'companyId required' });
        const { page, limit } = req.query;
        const result = await debtService.listDebts({ companyId, status: 'UNPAID', page: Number(page) || 1, limit: Number(limit) || 50 });
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

async function listShopDebts(req, res) {
    try {
        const shopId = req.params.shopId;
        const companyId = req.body.companyId || req.headers['x-company-id'];
        if (!companyId) return res.status(400).json({ error: 'companyId required' });
        const result = await debtService.listDebts({ companyId, shopId });
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

// List paid debts for a shop (convenience route)
async function listShopPaidDebts(req, res) {
    try {
        const shopId = req.params.shopId;
        const companyId = req.body.companyId || req.headers['x-company-id'];
        if (!companyId) return res.status(400).json({ error: 'companyId required' });
        const { page, limit } = req.query;
        const result = await debtService.listDebts({ companyId, shopId, status: 'PAID', page: Number(page) || 1, limit: Number(limit) || 50 });
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

// List partially-paid debts for a shop
async function listShopPartiallyPaidDebts(req, res) {
    try {
        const shopId = req.params.shopId;
        const companyId = req.body.companyId || req.headers['x-company-id'];
        if (!companyId) return res.status(400).json({ error: 'companyId required' });
        const { page, limit } = req.query;
        const result = await debtService.listDebts({ companyId, shopId, status: 'PARTIALLY_PAID', page: Number(page) || 1, limit: Number(limit) || 50 });
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

// List unpaid debts for a shop
async function listShopUnpaidDebts(req, res) {
    try {
        const shopId = req.params.shopId;
        const companyId = req.body.companyId || req.headers['x-company-id'];
        if (!companyId) return res.status(400).json({ error: 'companyId required' });
        const { page, limit } = req.query;
        const result = await debtService.listDebts({ companyId, shopId, status: 'UNPAID', page: Number(page) || 1, limit: Number(limit) || 50 });
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

async function listCustomerDebts(req, res) {
    try {
        const customerId = req.params.customerId;
        const result = await debtService.listDebts({ customerId });
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

// List paid debts for a customer (convenience route)
async function listCustomerPaidDebts(req, res) {
    try {
        const customerId = req.params.customerId;
        const { page, limit } = req.query;
        const result = await debtService.listDebts({ customerId, status: 'PAID', page: Number(page) || 1, limit: Number(limit) || 50 });
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

// List partially-paid debts for a customer
async function listCustomerPartiallyPaidDebts(req, res) {
    try {
        const customerId = req.params.customerId;
        const { page, limit } = req.query;
        const result = await debtService.listDebts({ customerId, status: 'PARTIALLY_PAID', page: Number(page) || 1, limit: Number(limit) || 50 });
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

// List unpaid debts for a customer
async function listCustomerUnpaidDebts(req, res) {
    try {
        const customerId = req.params.customerId;
        const { page, limit } = req.query;
        const result = await debtService.listDebts({ customerId, status: 'UNPAID', page: Number(page) || 1, limit: Number(limit) || 50 });
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

async function listAllDebts(req, res) {
    try {
        const { status, page, limit } = req.query;
        const result = await debtService.listAllDebts({ status, page: Number(page) || 1, limit: Number(limit) || 50 });
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

// Internal lookup used by sales-service: returns aggregated cross-company summary for a hashedCustomerId
async function internalLookup(req, res) {
    try {
        const hashedCustomerId = req.body.hashedCustomerId || req.query.hashedCustomerId;
        const requestingCompanyId = req.headers['x-company-id'];
        if (!hashedCustomerId) return res.status(400).json({ error: 'hashedCustomerId required' });

        const { isValidHashedCustomerId } = require('../utils/hashedId');
        if (!isValidHashedCustomerId(hashedCustomerId)) return res.status(400).json({ error: 'malformed hashedCustomerId' });

        // Try cache first (use shared cache helpers)
        const cache = require('../utils/cache');
        const cacheKey = `debt:lookup:${hashedCustomerId}`;
        try {
            const cached = await cache.get(cacheKey);
            if (cached) return res.json(JSON.parse(cached));
        } catch (e) { /* swallow cache errors */ }

        const crossRepo = require('../repositories/crossCompanyRepository');
        const summary = await crossRepo.findByHashedCustomerId(hashedCustomerId);
        if (!summary) {
            const out = { exists: false, hashedCustomerId, lastUpdated: new Date() };
            try { await cache.set(cacheKey, out, 30); } catch (e) { }
            return res.json(out);
        }

        // determine whether details may be shown (basic policy: NONE -> no detail; PARTIAL/FULL -> allow limited detail)
        const detailAllowed = summary.worstShareLevel && summary.worstShareLevel !== 'NONE';

        // Mirror the SALE_DEBT_RESPONSE payload shape so events and HTTP lookup are consistent
        const out = {
            success: true,
            exists: true,
            hashedCustomerId: summary.hashedCustomerId,
            totalOutstanding: summary.totalOutstanding || 0,
            numActiveDebts: summary.numActiveDebts || 0,
            largestDebt: summary.largestDebt || 0,
            worstShareLevel: summary.worstShareLevel || 'NONE',
            riskScore: summary.riskScore || 0,
            riskLabel: summary.riskLabel || 'GOOD',
            numCompaniesWithDebt: summary.numCompaniesWithDebt || (Array.isArray(summary.companies) ? summary.companies.length : 0),
            detailAllowed,
            lastUpdated: summary.lastUpdated || new Date(),
            correlationId: null
        };

        try { await cache.set(cacheKey, out, 30); } catch (e) { }
        // Emit a lookup event so sales-service (or other interested consumers) can be notified of POS lookups.
        try {
            const inMemoryStore = require('../utils/inMemoryStore');
            const ev = {
                eventType: 'CROSS_COMPANY_LOOKUP',
                payload: {
                    hashedCustomerId,
                    requestingCompanyId: requestingCompanyId || null,
                    detailAllowed: !!detailAllowed,
                    exists: out.exists,
                    ts: new Date()
                }
            };
            // fire-and-forget enqueue; persister will persist and outbox worker will publish
            inMemoryStore.enqueueEvent(ev);
        } catch (e) { /* swallow event errors - lookup still returns result */ }

        return res.json(out);
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
        const cache = require('../utils/cache');
        const cacheKey = `debt:customer:${hashedId}:debts`;
        try {
            const cached = await cache.get(cacheKey);
            if (cached) return res.json({ debts: JSON.parse(cached) });
        } catch (e) { /* swallow cache errors */ }

        const results = await require('../services/debtService').crossCompanyCustomerDebts({ hashedCustomerId: hashedId, requestingCompanyId });
        try { await cache.set(cacheKey, results, 30); } catch (e) { }
        res.json({ debts: results });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

// New endpoint: query by raw identifier (phone/NID/etc) — server will hash, look up known customers and cross-company debts
// (removed) lookup by raw identifier — handled in sales service

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

// Mark debt as paid: create repayment for remaining amount (if any) and mark debt PAID
async function markDebtPaid(req, res) {
    try {
        const companyId = req.body.companyId || req.headers['x-company-id'];
        const debtId = req.params.debtId;
        if (!companyId) return res.status(400).json({ error: 'companyId required' });
        if (!debtId) return res.status(400).json({ error: 'debtId required' });

        const createdBy = req.body.createdBy || (req.headers['x-user-id'] ? { id: req.headers['x-user-id'], name: req.headers['x-user-name'] || null } : undefined);
        const result = await require('../services/debtService').markDebtPaid({ companyId, debtId, paymentMethod: req.body.paymentMethod, paymentReference: req.body.paymentReference, paymentId: req.body.paymentId, createdBy });
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

// Cancel a debt (set status to CANCELLED, keep record for audit)
async function cancelDebt(req, res) {
    try {
        const companyId = req.body.companyId || req.headers['x-company-id'];
        const debtId = req.params.debtId;
        if (!companyId) return res.status(400).json({ error: 'companyId required' });
        if (!debtId) return res.status(400).json({ error: 'debtId required' });

        const reason = req.body.reason || null;
        const performedBy = req.body.performedBy || (req.headers['x-user-id'] ? { id: req.headers['x-user-id'], name: req.headers['x-user-name'] || null } : undefined);
        const result = await require('../services/debtService').cancelDebt({ companyId, debtId, reason, performedBy });
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
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
    ,
    listAllDebts
    ,
    internalLookup
    ,
    markDebtPaid,
    cancelDebt
    ,
    listCompanyPaidDebts
    ,
    listShopPaidDebts,
    listCustomerPaidDebts
    ,
    listCompanyPartiallyPaidDebts,
    listCompanyUnpaidDebts,
    listShopPartiallyPaidDebts,
    listShopUnpaidDebts,
    listCustomerPartiallyPaidDebts,
    listCustomerUnpaidDebts
};
