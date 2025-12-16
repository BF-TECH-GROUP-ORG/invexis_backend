/**
 * Authentication & Authorization Middleware
 * Handles user authentication and role-based access control
 */

const logger = require('../utils/logger');

/**
 * Authenticate user from token/session
 * Extracts user info from Authorization header or session
 */
const authenticate = (req, res, next) => {
    try {
        // Try to get token from Authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                success: false,
                message: 'Authorization header missing'
            });
        }

        // Extract token from "Bearer <token>" format
        const token = authHeader.startsWith('Bearer ')
            ? authHeader.slice(7)
            : authHeader;

        // In a real app, you would verify the JWT here
        // For now, we'll simulate user from token
        req.user = {
            id: req.headers['x-user-id'] || 'anonymous',
            companyId: req.headers['x-company-id'] || 'default',
            role: req.headers['x-user-role'] || 'customer',
            email: req.headers['x-user-email'] || ''
        };

        if (!req.user.id || req.user.id === 'anonymous') {
            return res.status(401).json({
                success: false,
                message: 'Authentication failed'
            });
        }

        logger.debug(`User authenticated: ${req.user.id} (${req.user.role})`);
        next();
    } catch (error) {
        logger.error(`Authentication error: ${error.message}`);
        return res.status(401).json({
            success: false,
            message: 'Authentication failed',
            error: error.message
        });
    }
};

/**
 * Optional authentication
 * Same as authenticate but doesn't fail if user not provided
 */
const optionalAuth = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (authHeader) {
            const token = authHeader.startsWith('Bearer ')
                ? authHeader.slice(7)
                : authHeader;

            req.user = {
                id: req.headers['x-user-id'] || 'anonymous',
                companyId: req.headers['x-company-id'] || 'default',
                role: req.headers['x-user-role'] || 'customer',
                email: req.headers['x-user-email'] || ''
            };
        } else {
            // Provide anonymous user
            req.user = {
                id: 'guest',
                companyId: req.headers['x-company-id'] || 'default',
                role: 'guest',
                email: ''
            };
        }

        next();
    } catch (error) {
        logger.warn(`Optional auth error: ${error.message}`);
        // Continue even if error
        req.user = {
            id: 'guest',
            companyId: req.headers['x-company-id'] || 'default',
            role: 'guest',
            email: ''
        };
        next();
    }
};

/**
 * Check if user has required role
 * @param {string|Array} requiredRoles - Role(s) required to access endpoint
 */
const authorize = (requiredRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

        if (!roles.includes(req.user.role)) {
            logger.warn(`Authorization failed: ${req.user.id} tried to access ${req.path} as ${req.user.role}`);
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions',
                required: roles,
                current: req.user.role
            });
        }

        next();
    };
};

/**
 * Check if user is admin
 */
const isAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'User not authenticated'
        });
    }

    if (req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Admin access required'
        });
    }

    next();
};

/**
 * Validate company ownership
 * Ensure user can only access their own company's data
 */
const validateCompanyAccess = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'User not authenticated'
        });
    }

    const companyId = req.query.companyId || req.body?.companyId || req.params?.companyId;

    // Admin can access any company
    if (req.user.role === 'admin') {
        next();
        return;
    }

    // Non-admin users can only access their own company
    if (companyId && companyId !== req.user.companyId) {
        logger.warn(`Company access denied: ${req.user.id} tried to access company ${companyId}`);
        return res.status(403).json({
            success: false,
            message: 'Cannot access other companies data'
        });
    }

    next();
};

module.exports = {
    authenticate,
    optionalAuth,
    authorize,
    isAdmin,
    validateCompanyAccess
};
