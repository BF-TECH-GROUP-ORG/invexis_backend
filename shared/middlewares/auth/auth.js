// /app/shared/middlewares/auth/auth.js
const jwt = require('jsonwebtoken');
const axios = require('axios');
const crypto = require('crypto');
const redis = require('/app/shared/redis');
const { publish } = require('/app/shared/rabbitmq');

// Define AuthError as a class
class AuthError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
        this.name = 'AuthError';
    }
}

// Configuration
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:8001/auth';
const JWT_SECRET = process.env.JWT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3002';
const IP_WHITELIST = process.env.IP_WHITELIST ? process.env.IP_WHITELIST.split(',') : [];

// Helper Functions
function verifyToken(token) {
    if (!token) throw new AuthError('No token provided', 401);
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded;
    } catch (err) {
        throw new AuthError('Invalid token', 401);
    }
}

async function fetchUserFromAuthService(userId, accessToken) {
    try {
        const response = await axios.get(`${AUTH_SERVICE_URL}/me`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        return response.data.user;
    } catch (err) {
        if (err.response?.status === 401) {
            throw new AuthError('Unauthorized - invalid or expired token', 401);
        }
        throw new AuthError('Failed to fetch user info', 500);
    }
}

// 1. authenticateToken
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ ok: false, message: 'Access token required' });

    try {
        req.decodedToken = verifyToken(token);
        next();
    } catch (err) {
        return res.status(err.status || 401).json({ ok: false, message: err.message });
    }
};

// 2. fetchUser
const fetchUser = async (req, res, next) => {
    if (!req.decodedToken) return res.status(401).json({ ok: false, message: 'Token not verified' });

    const { sub: userId } = req.decodedToken;
    const token = req.headers.authorization?.split(' ')[1];

    try {
        req.user = await fetchUserFromAuthService(userId, token);
        next();
    } catch (err) {
        return res.status(err.status || 500).json({ ok: false, message: err.message });
    }
};

// 3. requireAuth
const requireAuth = async (req, res, next) => {
    await authenticateToken(req, res, () => { });
    if (res.headersSent) return;
    await fetchUser(req, res, next);
};

// 4. requireRole
const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ ok: false, message: 'User not authenticated' });
        const userRole = req.user.role;
        const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
        if (!rolesArray.includes(userRole)) {
            return res.status(403).json({ ok: false, message: `Insufficient role: ${userRole}. Required: ${rolesArray.join(', ')}` });
        }
        next();
    };
};

// 5. requireCompany
const requireCompany = (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, message: 'User not authenticated' });
    const companyId = req.params.companyId || req.body.companyId || req.query.companyId;
    if (!companyId) return res.status(400).json({ ok: false, message: 'Company ID required' });
    if (!req.user.companies || !req.user.companies.includes(companyId)) {
        return res.status(403).json({ ok: false, message: 'Access denied: not authorized for this company' });
    }
    next();
};

// 6. requireShop
const requireShop = (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, message: 'User not authenticated' });
    const shopId = req.params.shopId || req.body.shopId || req.query.shopId;
    if (!shopId) return res.status(400).json({ ok: false, message: 'Shop ID required' });
    if (!req.user.shops || !req.user.shops.includes(shopId)) {
        return res.status(403).json({ ok: false, message: 'Access denied: not authorized for this shop' });
    }
    next();
};

// 7. requireActiveAccount
const requireActiveAccount = (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, message: 'User not authenticated' });
    if (req.user.accountStatus !== 'active') {
        return res.status(403).json({ ok: false, message: 'Account inactive' });
    }
    next();
};

// 8. validateRefreshToken
const validateRefreshToken = (req, res, next) => {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
    if (!refreshToken) return res.status(400).json({ ok: false, message: 'Refresh token required' });

    try {
        req.decodedRefreshToken = jwt.verify(refreshToken, JWT_SECRET); // Assume shared tokenService.verifyRefresh
        next();
    } catch (err) {
        return res.status(401).json({ ok: false, message: 'Invalid refresh token' });
    }
};

// 9. rateLimitByUser
const rateLimitByUser = (maxRequests, windowMs) => {
    return async (req, res, next) => {
        const userId = req.user?._id || req.decodedToken?.sub;
        if (!userId) return next();
        const key = `rate:${userId}`;
        const current = parseInt(await redis.get(key) || 0);
        if (current >= maxRequests) {
            return res.status(429).json({ ok: false, message: 'Rate limit exceeded' });
        }
        await redis.incr(key);
        await redis.expire(key, windowMs / 1000);
        next();
    };
};

// 10. logRequest
const logRequest = (req, res, next) => {
    const userId = req.user?._id || req.decodedToken?.sub || 'anonymous';
    console.log(`Request: ${req.method} ${req.path} by user ${userId} from ${req.ip}`);
    next();
};

// 11. corsForAuth
const corsForAuth = (req, res, next) => {
    res.header('Access-Control-Allow-Origin', FRONTEND_URL);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
    res.header('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
};

// 12. validateCSRF
const validateCSRF = (req, res, next) => {
    if (req.csrfToken && req.body._csrf !== req.csrfToken()) {
        return res.status(403).json({ ok: false, message: 'Invalid CSRF token' });
    }
    next();
};

// 13. checkTokenBlacklist
const checkTokenBlacklist = async (req, res, next) => {
    if (!req.decodedToken) return res.status(401).json({ ok: false, message: 'Token not verified' });
    const tokenJti = req.decodedToken.jti;
    const blacklisted = await redis.get(`blacklist:${tokenJti}`);
    if (blacklisted) {
        return res.status(401).json({ ok: false, message: 'Token revoked' });
    }
    next();
};

// 14. enforce2FA
const enforce2FA = async (req, res, next) => {
    if (!req.user || !req.user.twoFAEnabled) {
        return res.status(403).json({ ok: false, message: '2FA required for this action' });
    }
    const sessionKey = `2fa_verified:${req.user._id}:${req.decodedToken.jti}`;
    const verified = await redis.get(sessionKey);
    if (!verified) {
        return res.status(403).json({ ok: false, message: '2FA verification needed' });
    }
    next();
};

// 15. ipWhitelist
const ipWhitelist = (whitelist = IP_WHITELIST) => {
    return (req, res, next) => {
        const clientIp = req.ip || req.headers['x-forwarded-for'];
        if (whitelist.length && !whitelist.includes(clientIp)) {
            return res.status(403).json({ ok: false, message: 'IP not whitelisted' });
        }
        next();
    };
};

// 16. deviceFingerprint
const deviceFingerprint = async (req, res, next) => {
    if (!req.user) return next();
    const ua = req.get('User-Agent');
    const fp = crypto.createHash('md5').update(ua + req.ip).digest('hex');
    const sessionKey = `device_fp:${req.user._id}:${req.decodedToken.jti}`;
    const storedFp = await redis.get(sessionKey);
    if (storedFp && storedFp !== fp) {
        await publish('events_topic', 'suspicious.device_change', { userId: req.user._id, oldFp: storedFp, newFp: fp });
    }
    await redis.set(sessionKey, fp, 'EX', 24 * 60 * 60);
    req.deviceFingerprint = fp;
    next();
};

// 17. checkConsent
const checkConsent = (consentTypes = ['terms_and_privacy_sbapshop']) => {
    return async (req, res, next) => {
        if (!req.user) return res.status(401).json({ ok: false, message: 'User not authenticated' });
        // Placeholder: Query consent (implement if model added)
        const consents = []; // Fetch from DB
        if (consents.length !== consentTypes.length) {
            return res.status(403).json({ ok: false, message: 'Missing or revoked consent' });
        }
        next();
    };
};

// 18. auditLog
const auditLog = (action) => {
    return async (req, res, next) => {
        const auditData = {
            userId: req.user?._id,
            action,
            resource: req.path,
            ip: req.ip,
            timestamp: new Date(),
            details: { method: req.method, body: req.body } // Sanitize in prod
        };
        await publish('events_topic', `audit.${action}`, auditData);
        next();
    };
};

// 19. permissionCheck
const permissionCheck = (requiredPerms) => {
    return (req, res, next) => {
        if (!req.user || !req.user.permissions) {
            return res.status(403).json({ ok: false, message: 'Permissions not loaded' });
        }
        const hasPerms = requiredPerms.every(perm => req.user.permissions.includes(perm));
        if (!hasPerms) {
            return res.status(403).json({ ok: false, message: `Missing permissions: ${requiredPerms.join(', ')}` });
        }
        next();
    };
};

// 20. validateServiceToken
const validateServiceToken = async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ ok: false, message: 'Service token required' });
    // Placeholder: Validate against Redis or DB
    const storedKey = await redis.get(`service_key:${apiKey}`);
    if (!storedKey) return res.status(401).json({ ok: false, message: 'Invalid service token' });
    req.service = { key: apiKey };
    next();
};

// 21. cacheUser
const cacheUser = async (req, res, next) => {
    if (!req.user) return next();
    const cacheKey = `user:${req.user._id}`;
    await redis.set(cacheKey, JSON.stringify(req.user), 'EX', 5 * 60);
    next();
};

// 22. errorHandler
const errorHandler = (err, req, res, next) => {
    if (err instanceof AuthError) {
        return res.status(err.status).json({ ok: false, message: err.message });
    }
    console.error('Auth middleware error:', err);
    publish('events_topic', 'auth.error', { error: err.message, path: req.path, userId: req.user?._id });
    res.status(500).json({ ok: false, message: 'Internal server error' });
};

// Exports
module.exports = {
    authenticateToken,
    fetchUser,
    requireAuth,
    requireRole,
    requireCompany,
    requireShop,
    requireActiveAccount,
    validateRefreshToken,
    rateLimitByUser,
    logRequest,
    corsForAuth,
    validateCSRF,
    checkTokenBlacklist,
    enforce2FA,
    ipWhitelist,
    deviceFingerprint,
    checkConsent,
    auditLog,
    permissionCheck,
    validateServiceToken,
    cacheUser,
    errorHandler
};