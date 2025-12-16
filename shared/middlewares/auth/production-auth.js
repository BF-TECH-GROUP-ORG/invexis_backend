// shared/middlewares/auth/production-auth.js
// Production-ready authentication middleware for Invexis microservices

const jwt = require('jsonwebtoken');
const axios = require('axios');
const { getLogger } = require('../../logger');
const redis = require('/app/shared/redis');

const logger = getLogger('auth-middleware');
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:8001';
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REDIS_TTL = 300; // 5 minutes cache

class AuthenticationError extends Error {
  constructor(message, code = 'AUTH_ERROR') {
    super(message);
    this.name = 'AuthenticationError';
    this.code = code;
    this.statusCode = 401;
  }
}

class AuthorizationError extends Error {
  constructor(message, code = 'AUTHZ_ERROR') {
    super(message);
    this.name = 'AuthorizationError';
    this.code = code;
    this.statusCode = 403;
  }
}

/**
 * Core JWT verification function
 */
function verifyJWT(token) {
  try {
    return jwt.verify(token, JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: 'invexis-auth',
      audience: 'invexis-apps'
    });
  } catch (err) {
    logger.warn('JWT verification failed', {
      error: err.message,
      expiredAt: err.expiredAt,
      currentServerTime: new Date().toISOString(),
      secretDefined: !!JWT_ACCESS_SECRET
    });
    // Temporary console log for immediate visibility in terminal
    console.error(`[JWT DEBUG] Failed: ${err.message}`);
    if (err.expiredAt) console.error(`[JWT DEBUG] Expired At: ${err.expiredAt} vs Now: ${new Date().toISOString()}`);
    if (!JWT_ACCESS_SECRET) console.error(`[JWT DEBUG] FATAL: JWT_ACCESS_SECRET is missing!`);

    return null;
  }
}

// Helper to safely get the User model (if running in Auth Service with Mongoose)
let User = null;
try {
  // Only auth-service has mongoose and the User model registered
  // wrapped in try-catch because other services (like shop-service) might not have mongoose installed
  const mongoose = require('mongoose');
  if (mongoose.models && mongoose.models.User) {
    User = mongoose.models.User;
    logger.info('ProductionAuth: Local User model detected - using direct DB access');
  }
} catch (e) {
  // Mongoose not available or User model not registered - standard for non-auth services
}

/**
 * Fetch user from auth with Redis caching or local DB (if available)
 */
async function fetchUserData(userId, accessToken) {
  const cacheKey = `user:${userId}`;

  try {
    // Try Redis cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.debug('User data retrieved from cache', { userId });
      return JSON.parse(cached);
    }


    let userData;

    // Use local DB if available (prevents infinite loop in auth-service)
    if (User) {
      // We are in auth-service, use direct DB access
      const userDoc = await User.findById(userId).lean();
      if (userDoc) {
        // sanitize (similar to what API returns)
        userData = {
          _id: userDoc._id,
          // Ensure a stable "id" field for all downstream services
          id: userDoc._id?.toString(),
          email: userDoc.email,
          firstName: userDoc.firstName,
          lastName: userDoc.lastName,
          role: userDoc.role,
          requiresProfileCompletion: userDoc.requiresProfileCompletion,
          isEmailVerified: userDoc.isEmailVerified,
          companies: userDoc.companies || [],
          shops: userDoc.shops || [],
          permissions: userDoc.permissions || []
        };
      }
    } else {
      // We are in another service, fetch from auth service API
      const response = await axios.get(`${AUTH_SERVICE_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Gateway-Request': 'true'
        },
        timeout: 5000
      });
      userData = response.data.user;
    }

    if (!userData) {
      throw new Error('User not found');
    }

    // Cache for 5 minutes
    await redis.set(cacheKey, JSON.stringify(userData), 'EX', REDIS_TTL);

    logger.debug('User data fetched', { userId, source: User ? 'db' : 'api' });
    return userData;

  } catch (error) {
    logger.error('Failed to fetch user data', {
      userId,
      error: error.message,
      status: error.response?.status
    });
    return null;
  }
}

/**
 * Extract token from various sources
 */
function extractToken(req) {
  // Bearer token from Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    // Handle "Bearer <token>" format case-insensitively
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      return parts[1];
    }
    // Handle situations where just the token might be sent in Authorization (fallback)
    if (parts.length === 1 && parts[0].length > 20) {
      return parts[0];
    }
  }

  // Token from query parameter (for websockets or special access)
  if (req.query.token) {
    return req.query.token;
  }

  // Token from custom header
  if (req.headers['x-access-token']) {
    return req.headers['x-access-token'];
  }

  return null;
}

/**
 * Core authentication middleware
 * Verifies JWT and loads user data
 */
const authenticateToken = async (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      throw new AuthenticationError('Access token required', 'MISSING_TOKEN');
    }

    // Verify JWT
    const decoded = verifyJWT(token);
    if (!decoded) {
      throw new AuthenticationError('Invalid or expired token', 'INVALID_TOKEN');
    }

    // Check token blacklist
    const blacklistKey = `blacklist:${token}`;
    const isBlacklisted = await redis.get(blacklistKey);
    if (isBlacklisted) {
      throw new AuthenticationError('Token has been revoked', 'TOKEN_REVOKED');
    }

    // Fetch full user data or fallback to token
    let userData = await fetchUserData(decoded.sub || decoded.uid, token);

    // If fetch failed (Auth Service down) or user not found, but we have a valid token,
    // trust the token claims (Offline Mode / Token-based Auth)
    if (!userData) {
      logger.warn('User data fetch failed, falling back to token data', { userId: decoded.sub || decoded.uid });
      userData = {
        _id: decoded.sub || decoded.uid,
        id: decoded.sub || decoded.uid,
        email: decoded.email,
        role: decoded.role,
        companies: decoded.companies || [],
        shops: decoded.shops || [],
        firstName: 'Unknown',
        lastName: 'User'
      };
    }

    // Attach to request
    req.user = userData;
    req.token = token;
    req.decodedToken = decoded;

    // Ensure critical fields are available from token if missing in DB/API response
    if (!req.user.role && decoded.role) req.user.role = decoded.role;
    if ((!req.user.companies || req.user.companies.length === 0) && decoded.companies) req.user.companies = decoded.companies;
    if ((!req.user.shops || req.user.shops.length === 0) && decoded.shops) req.user.shops = decoded.shops;
    if (!req.user.email && decoded.email) req.user.email = decoded.email;
    if (!req.user._id && (decoded.sub || decoded.uid)) req.user._id = decoded.sub || decoded.uid;

    logger.info('User authenticated', {
      userId: userData.id || userData._id,
      email: userData.email,
      role: userData.role
    });

    next();

  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code
      });
    }

    logger.error('Authentication error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Authentication service error',
      code: 'AUTH_SERVICE_ERROR'
    });
  }
};

/**
 * Optional authentication (for public endpoints with optional auth)
 */
const optionalAuth = async (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    return next(); // Continue without auth
  }

  try {
    const decoded = verifyJWT(token);
    if (decoded) {
      let userData = await fetchUserData(decoded.sub || decoded.uid, token);

      // Fallback to token if user data fetch fails
      if (!userData) {
        userData = {
          _id: decoded.sub || decoded.uid,
          id: decoded.sub || decoded.uid,
          email: decoded.email,
          role: decoded.role,
          companies: decoded.companies || [],
          shops: decoded.shops || []
        };
      }

      if (userData) {
        req.user = userData;
        req.token = token;
        req.decodedToken = decoded;

        // Ensure critical fields available
        if (!req.user.role && decoded.role) req.user.role = decoded.role;
        if ((!req.user.companies || req.user.companies.length === 0) && decoded.companies) req.user.companies = decoded.companies;
      }
    }
  } catch (error) {
    logger.warn('Optional auth failed', { error: error.message });
  }

  next();
};

/**
 * Role-based authorization
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const userRole = req.user.role;
    // Flatten roles to handle both requireRole('admin', 'worker') and requireRole(['admin', 'worker'])
    const roles = allowedRoles.flat();

    if (!roles.includes(userRole)) {
      logger.warn('Insufficient role', {
        userId: req.user.id,
        userRole,
        requiredRoles: allowedRoles
      });

      return res.status(403).json({
        success: false,
        error: `Insufficient privileges. Required: ${allowedRoles.join(', ')}`,
        code: 'INSUFFICIENT_ROLE'
      });
    }

    next();
  };
};

/**
 * Company ownership validation
 */
const requireCompanyAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  const companyId = req.params.companyId || req.body.companyId || req.query.companyId;

  if (!companyId) {
    return res.status(400).json({
      success: false,
      error: 'Company ID required',
      code: 'MISSING_COMPANY_ID'
    });
  }

  // Check if user belongs to company
  const userCompanies = req.user.companies || [];
  const hasAccess = userCompanies.some(company =>
    company === companyId || company.toString() === companyId
  );

  if (!hasAccess) {
    logger.warn('Company access denied', {
      userId: req.user.id,
      companyId,
      userCompanies
    });

    return res.status(403).json({
      success: false,
      error: 'Access denied for this company',
      code: 'COMPANY_ACCESS_DENIED'
    });
  }

  req.companyId = companyId;
  next();
};

/**
 * Permission-based authorization
 */
const requirePermission = (...requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const userPermissions = req.user.permissions || [];
    const hasPermission = requiredPermissions.some(permission =>
      userPermissions.includes(permission)
    );

    if (!hasPermission) {
      logger.warn('Permission denied', {
        userId: req.user.id,
        userPermissions,
        requiredPermissions
      });

      return res.status(403).json({
        success: false,
        error: `Missing required permissions: ${requiredPermissions.join(', ')}`,
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    next();
  };
};

/**
 * Admin-only middleware
 */
const requireAdmin = requireRole('admin', 'super_admin');

/**
 * Invalidate user cache (for logout/profile updates)
 */
async function invalidateUserCache(userId) {
  const cacheKey = `user:${userId}`;
  await redis.del(cacheKey);
  logger.info('User cache invalidated', { userId });
}

/**
 * Blacklist token (for logout)
 */
async function blacklistToken(token, expiresIn = 3600) {
  const blacklistKey = `blacklist:${token}`;
  await redis.set(blacklistKey, '1', 'EX', expiresIn);
  logger.info('Token blacklisted', { token: token.substring(0, 20) + '...' });
}

module.exports = {
  authenticateToken,
  optionalAuth,
  requireRole,
  requireCompanyAccess,
  requirePermission,
  requireAdmin,
  invalidateUserCache,
  blacklistToken,
  AuthenticationError,
  AuthorizationError
};