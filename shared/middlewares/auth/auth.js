// middleware/authMiddleware.js
// Comprehensive Auth Middleware for Microservices Architecture
// Integrates with existing authService, tokenService, redis, publishEvent, and AuthError
// Usage: Import and chain in routes, e.g., router.use(requireAuth, requireRole('admin'), ...)

const jwt = require('jsonwebtoken');
const axios = require('axios');
const crypto = require('crypto');
const redis = require('/app/shared/redis.js'); // Shared Redis module
const { publishEvent } = require('../services/authService'); // From authService
const { tokenService } = require('../services/tokenService'); // Reuse for token ops
const AuthError = require('../services/authService').AuthError; // Custom error
const Consent = require('../models/Consent.models'); // For consent checks

// Configuration (set via env or config service)
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001/auth';
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

// 1. authenticateToken: Verifies access token from Authorization header.
//    Attaches decoded payload to req.decodedToken.
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

// 2. fetchUser: Fetches full user from auth service.
//    Attaches to req.user. Requires authenticateToken first.
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

// 3. requireAuth: Full auth chain (authenticateToken + fetchUser).
const requireAuth = async (req, res, next) => {
    await authenticateToken(req, res, () => { });
    if (res.headersSent) return;
    await fetchUser(req, res, next);
};

// 4. requireRole: Role-based access control.
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

// 5. requireCompany: Company-scoped access.
const requireCompany = (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, message: 'User not authenticated' });
    const companyId = req.params.companyId || req.body.companyId || req.query.companyId;
    if (!companyId) return res.status(400).json({ ok: false, message: 'Company ID required' });
    if (!req.user.companies || !req.user.companies.includes(companyId)) {
        return res.status(403).json({ ok: false, message: 'Access denied: not authorized for this company' });
    }
    next();
};

// 6. requireShop: Shop-scoped access.
const requireShop = (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, message: 'User not authenticated' });
    const shopId = req.params.shopId || req.body.shopId || req.query.shopId;
    if (!shopId) return res.status(400).json({ ok: false, message: 'Shop ID required' });
    if (!req.user.shops || !req.user.shops.includes(shopId)) {
        return res.status(403).json({ ok: false, message: 'Access denied: not authorized for this shop' });
    }
    next();
};

// 7. requireActiveAccount: Ensures account is active.
const requireActiveAccount = (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, message: 'User not authenticated' });
    if (req.user.accountStatus !== 'active') {
        return res.status(403).json({ ok: false, message: 'Account inactive' });
    }
    next();
};

// 8. validateRefreshToken: Verifies refresh token.
const validateRefreshToken = (req, res, next) => {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
    if (!refreshToken) return res.status(400).json({ ok: false, message: 'Refresh token required' });

    try {
        req.decodedRefreshToken = tokenService.verifyRefresh(refreshToken); // Implement verifyRefresh in tokenService if needed
        next();
    } catch (err) {
        return res.status(401).json({ ok: false, message: 'Invalid refresh token' });
    }
};

// 9. rateLimitByUser: User-based rate limiting (in-memory; use Redis for prod).
const rateLimitByUser = (maxRequests, windowMs) => {
    const requests = new Map();
    return (req, res, next) => {
        const userId = req.user?._id || req.decodedToken?.sub;
        if (!userId) return next();
        const key = `rate:${userId}`;
        const now = Date.now();
        const windowStart = now - windowMs;
        if (!requests.has(key)) requests.set(key, []);
        const userRequests = requests.get(key).filter(time => time > windowStart);
        if (userRequests.length >= maxRequests) {
            return res.status(429).json({ ok: false, message: 'Rate limit exceeded' });
        }
        userRequests.push(now);
        requests.set(key, userRequests);
        next();
    };
};

// 10. logRequest: Basic request logging.
const logRequest = (req, res, next) => {
    const userId = req.user?._id || req.decodedToken?.sub || 'anonymous';
    console.log(`Auth request: ${req.method} ${req.path} by user ${userId} from ${req.ip}`);
    next();
};

// 11. corsForAuth: CORS with credentials.
const corsForAuth = (req, res, next) => {
    res.header('Access-Control-Allow-Origin', FRONTEND_URL);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
    res.header('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
};

// 12. validateCSRF: CSRF validation wrapper.
const validateCSRF = (req, res, next) => {
    if (req.csrfToken && req.body._csrf !== req.csrfToken()) {
        return res.status(403).json({ ok: false, message: 'Invalid CSRF token' });
    }
    next();
};

// 13. checkTokenBlacklist: Checks if token is blacklisted in Redis.
const checkTokenBlacklist = async (req, res, next) => {
    if (!req.decodedToken) return res.status(401).json({ ok: false, message: 'Token not verified' });
    const tokenJti = req.decodedToken.jti;
    const blacklisted = await redis.get(`blacklist:${tokenJti}`);
    if (blacklisted) {
        return res.status(401).json({ ok: false, message: 'Token revoked' });
    }
    next();
};

// 14. enforce2FA: Enforces 2FA for sensitive actions.
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

// 15. ipWhitelist: IP restriction.
const ipWhitelist = (whitelist = IP_WHITELIST) => {
    return (req, res, next) => {
        const clientIp = req.ip || req.headers['x-forwarded-for'];
        if (whitelist.length && !whitelist.includes(clientIp)) {
            return res.status(403).json({ ok: false, message: 'IP not whitelisted' });
        }
        next();
    };
};

// 16. deviceFingerprint: Device fingerprinting for security.
const deviceFingerprint = async (req, res, next) => {
    if (!req.user) return next();
    const ua = req.get('User-Agent');
    const fp = crypto.createHash('md5').update(ua + req.ip).digest('hex');
    const sessionKey = `device_fp:${req.user._id}:${req.decodedToken.jti}`;
    const storedFp = await redis.get(sessionKey);
    if (storedFp && storedFp !== fp) {
        await publishEvent('suspicious.device_change', { userId: req.user._id, oldFp: storedFp, newFp: fp });
    }
    await redis.set(sessionKey, fp, 'EX', 24 * 60 * 60);
    req.deviceFingerprint = fp;
    next();
};

// 17. checkConsent: Consent validation.
const checkConsent = (consentTypes = ['terms_and_privacy_sbapshop']) => {
    return async (req, res, next) => {
        if (!req.user) return res.status(401).json({ ok: false, message: 'User not authenticated' });
        const consents = await Consent.find({ userId: req.user._id, type: { $in: consentTypes }, revoked: false });
        if (consents.length !== consentTypes.length) {
            return res.status(403).json({ ok: false, message: 'Missing or revoked consent' });
        }
        next();
    };
};

// 18. auditLog: Audit logging.
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
        await publishEvent(`audit.${action}`, auditData);
        next();
    };
};

// 19. permissionCheck: Permission-based access.
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

// 20. validateServiceToken: Service-to-service auth.
const validateServiceToken = async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ ok: false, message: 'Service token required' });
    // Placeholder: Implement Service model lookup
    // const service = await Service.findOne({ apiKey: hashToken(apiKey) });
    // if (!service || service.active !== true) return res.status(401).json({ ok: false, message: 'Invalid service token' });
    // req.service = service;
    next(); // TODO: Implement full logic
};

// 21. cacheUser: Caches user data.
const cacheUser = async (req, res, next) => {
    if (!req.user) return next();
    const cacheKey = `user:${req.user._id}`;
    await redis.set(cacheKey, JSON.stringify(req.user), 'EX', 5 * 60);
    next();
};

// 22. errorHandler: Global error handler.
const errorHandler = (err, req, res, next) => {
    if (err instanceof AuthError) {
        return res.status(err.status).json({ ok: false, message: err.message });
    }
    console.error('Auth middleware error:', err);
    publishEvent('auth.error', { error: err.message, path: req.path, userId: req.user?._id });
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