// /app/src/middleware/authMiddleware.js
const tokenService = require('../services/tokenService');
const User = require('../models/User.models');

class AuthError extends Error {
    constructor(message, status = 400, code = 'AUTH_ERROR', type = 'authentication', details = null) {
        super(message);
        this.status = status;
        this.name = 'AuthError';
        this.code = code;
        this.type = type;
        this.details = details;
    }
}

async function requireAuth(req, res, next) {
    try {
        const header = req.headers.authorization;
        if (!header) throw new AuthError('No authorization header', 401);
        const token = header.split(' ')[1];
        if (!token) throw new AuthError('Invalid authorization format', 401);
        const payload = await tokenService.verifyAccess(token);
        if (!payload) throw new AuthError('Invalid or expired token', 401);
        const user = await User.findById(payload.sub);
        if (!user || user.accountStatus !== 'active') throw new AuthError('Unauthorized', 401);
        req.user = user;
        next();
    } catch (err) {
        return res.status(err.status || 401).json({ ok: false, message: 'Unauthorized', error: err.message });
    }
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ ok: false, message: 'Unauthorized' });
        if (!roles.includes(req.user.role)) return res.status(403).json({ ok: false, message: 'Forbidden' });
        next();
    };
}

function authErrorHandler(err, req, res, next) {
    // Log error for tracking
    console.error(`[Error] ${err.name}: ${err.message}`, {
        path: req.path,
        method: req.method,
        error: err,
        stack: err.stack
    });

    // If it's an AuthError, use its status and details
    if (err instanceof AuthError || err.name === 'AuthError') {
        return res.status(err.status || 400).json({
            ok: false,
            message: err.message,
            error: {
                code: err.code || 'AUTH_ERROR',
                type: err.type || 'authentication',
                details: err.details || undefined
            }
        });
    }

    if (err.code === 'EBADCSRFTOKEN') {
        // TODO: Publish to RabbitMQ: csrf.invalid { ip, device }
        return res.status(403).json({
            ok: false,
            message: 'Invalid CSRF token',
            error: {
                code: 'CSRF_ERROR',
                type: 'security'
            }
        });
    }

    if (err.name === 'ValidationError') {
        return res.status(400).json({
            ok: false,
            message: 'Validation failed',
            error: {
                code: 'VALIDATION_ERROR',
                type: 'validation',
                details: Object.values(err.errors).map(e => ({
                    field: e.path,
                    message: e.message,
                    value: e.value
                }))
            }
        });
    }

    if (err.name === 'MongoServerError') {
        if (err.code === 11000) {
            return res.status(409).json({
                ok: false,
                message: 'Duplicate key error',
                error: {
                    code: 'DUPLICATE_KEY',
                    type: 'database',
                    details: {
                        field: Object.keys(err.keyPattern)[0],
                        value: Object.values(err.keyValue)[0]
                    }
                }
            });
        }
    }

    // Log unexpected errors in detail
    console.error('Unexpected error:', {
        name: err.name,
        message: err.message,
        stack: err.stack,
        code: err.code,
        status: err.status
    });

    // Handle unexpected errors
    res.status(err.status || 500).json({
        ok: false,
        message: err.message || 'Internal server error',
        error: {
            code: err.code || err.name || 'INTERNAL_ERROR',
            type: err.type || 'server',
            details: process.env.NODE_ENV === 'development' ? {
                message: err.message,
                stack: err.stack
            } : undefined
        }
    });
} module.exports = { AuthError, requireAuth, requireRole, authErrorHandler };