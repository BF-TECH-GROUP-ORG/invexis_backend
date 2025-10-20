// /app/src/middleware/authMiddleware.js
const tokenService = require('../services/tokenService');
const User = require('../models/User.models');

class AuthError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
        this.name = 'AuthError';
    }
}

async function requireAuth(req, res, next) {
    try {
        const header = req.headers.authorization;
        if (!header) throw new AuthError('No authorization header', 401);
        const token = header.split(' ')[1];
        if (!token) throw new AuthError('Invalid authorization format', 401);
        const payload = tokenService.verifyAccess(token);
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
    if (err.code === 'EBADCSRFTOKEN') {
        // TODO: Publish to RabbitMQ: csrf.invalid { ip, device }
        return res.status(403).json({ ok: false, message: 'Invalid CSRF token' });
    }
    if (err instanceof AuthError) {
        return res.status(err.status).json({ ok: false, message: err.message });
    }
    next(err); // Pass to shared errorHandler
}

module.exports = { AuthError, requireAuth, requireRole, authErrorHandler };