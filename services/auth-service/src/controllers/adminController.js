const User = require('../models/User.models');
const redis = require('/app/shared/redis.js');

// TTL for cached company admins (in seconds)
const COMPANY_ADMINS_TTL = 300; // 5 minutes

async function getCompanyAdmins(req, res) {
    try {
        const companyId = req.params.companyId;
        if (!companyId) return res.status(400).json({ ok: false, message: 'companyId required' });

        const cacheKey = `company:admins:${companyId}`;

        // Try cache first
        try {
            const cached = await redis.get(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                return res.status(200).json({ ok: true, fromCache: true, admins: parsed });
            }
        } catch (e) {
            // Log but don't fail on redis errors
            console.warn('Redis get failed for company admins cache:', e && e.message);
        }

        // Cache miss - query MongoDB
        const admins = await User.find({ role: 'company_admin', companies: companyId })
            .select('_id firstName lastName email phone role companies shops position accountStatus')
            .lean();

        // Populate cache (best-effort)
        try {
            await redis.set(cacheKey, JSON.stringify(admins), 'EX', COMPANY_ADMINS_TTL);
        } catch (e) {
            console.warn('Redis set failed for company admins cache:', e && e.message);
        }

        return res.status(200).json({ ok: true, fromCache: false, admins });
    } catch (err) {
        console.error('getCompanyAdmins error:', err);
        return res.status(500).json({ ok: false, message: 'Internal server error' });
    }
}

module.exports = { getCompanyAdmins };

// Return all company_admin users regardless of company (cached)
async function getAllCompanyAdmins(req, res) {
    try {
        const cacheKey = `company:admins:all`;
        try {
            const cached = await redis.get(cacheKey);
            if (cached) return res.status(200).json({ ok: true, fromCache: true, admins: JSON.parse(cached) });
        } catch (e) {
            console.warn('Redis get failed for global company admins cache:', e && e.message);
        }

        const admins = await User.find({ role: 'company_admin' })
            .select('_id firstName lastName email phone role companies shops position accountStatus')
            .lean();

        try {
            await redis.set(cacheKey, JSON.stringify(admins), 'EX', COMPANY_ADMINS_TTL);
        } catch (e) {
            console.warn('Redis set failed for global company admins cache:', e && e.message);
        }

        return res.status(200).json({ ok: true, fromCache: false, admins });
    } catch (err) {
        console.error('getAllCompanyAdmins error:', err);
        return res.status(500).json({ ok: false, message: 'Internal server error' });
    }
}

module.exports = { getCompanyAdmins, getAllCompanyAdmins };
