const jwt = require('jsonwebtoken');
const { getLogger } = require('/app/shared/logger');

const logger = getLogger('gateway-auth');

const authenticateToken = (req, res, next) => {
    // Skip auth routes and health checks
    if (req.path.startsWith('/api/auth') || req.path === '/health') {
        return next();
    }

    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn('Missing or malformed auth header', { path: req.path, ip: req.ip });
        return res.status(401).json({ 
            success: false,
            error: 'Authorization header missing or malformed',
            code: 'MISSING_TOKEN'
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        // Use the same JWT configuration as auth service
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET, {
            algorithms: ['HS256'],
            issuer: 'invexis-auth',
            audience: 'invexis-apps'
        });

        // Attach user payload to request for forwarding to services
        req.user = {
            id: decoded.sub || decoded.id || decoded.uid,
            email: decoded.email,
            role: decoded.role,
            companyId: decoded.companyId || decoded.company_id,
            permissions: decoded.permissions || [],
            iat: decoded.iat,
            exp: decoded.exp
        };

        logger.debug('Token validated', { 
            userId: req.user.id, 
            role: req.user.role,
            path: req.path 
        });

        next();
    } catch (err) {
        logger.warn('JWT verification failed', { 
            error: err.message, 
            path: req.path, 
            ip: req.ip 
        });

        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                success: false,
                error: 'Token expired, please login again',
                code: 'TOKEN_EXPIRED'
            });
        }
        
        return res.status(403).json({ 
            success: false,
            error: 'Invalid token',
            code: 'INVALID_TOKEN'
        });
    }
};

module.exports = { authenticateToken };