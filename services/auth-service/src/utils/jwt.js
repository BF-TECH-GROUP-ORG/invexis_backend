const jwt = require('jsonwebtoken');

/**
 * Issue an access JWT for a user
 * @param {Object} user - user object { _id, email, role }
 * @returns {string} signed access JWT
 */
function issueAccessToken(user) {
    const payload = {
        id: user._id,
        email: user.email,
        role: user.role,
    };

    const options = {
        algorithm: 'HS256',
        expiresIn: process.env.JWT_ACCESS_EXPIRATION || '1h', // Default to 1h if not set
        issuer: process.env.JWT_ISSUER || 'auth-service',
        audience: process.env.JWT_AUDIENCE || 'auth-client',
    };

    return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, options);
}

/**
 * Issue a refresh JWT for a user
 * @param {Object} user - user object { _id }
 * @returns {string} signed refresh JWT
 */
function issueRefreshToken(user) {
    const payload = {
        id: user._id,
    };

    const options = {
        algorithm: 'HS256',
        expiresIn: process.env.JWT_REFRESH_EXPIRATION || '7d', // Default to 7 days if not set
        issuer: process.env.JWT_ISSUER || 'auth-service',
        audience: process.env.JWT_AUDIENCE || 'auth-client',
    };

    return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, options);
}

/**
 * Verify a JWT
 * @param {string} token - JWT to verify
 * @param {string} secret - Secret key (access or refresh)
 * @returns {Object} Decoded payload or throws error
 */
function verifyToken(token, secret) {
    try {
        return jwt.verify(token, secret);
    } catch (error) {
        throw new Error('Invalid or expired token');
    }
}

/**
 * Verify access token
 * @param {string} token - Access JWT to verify
 * @returns {Object} Decoded payload
 */
function verifyAccessToken(token) {
    return verifyToken(token, process.env.JWT_ACCESS_SECRET);
}

/**
 * Verify refresh token
 * @param {string} token - Refresh JWT to verify
 * @returns {Object} Decoded payload
 */
function verifyRefreshToken(token) {
    return verifyToken(token, process.env.JWT_REFRESH_SECRET);
}

module.exports = {
    issueAccessToken,
    issueRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
};