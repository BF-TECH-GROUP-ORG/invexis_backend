const jwt = require('jsonwebtoken');

/**
 * Issue a JWT for a user
 * @param {Object} user - user object { id, email, role }
 * @returns {string} signed JWT
 */
function issueToken(user) {
    const payload = {
        id: user._id,
        email: user.email,
        role: user.role,
    };

    const options = {
        algorithm: 'HS256',
        expiresIn: '1h',                     // token validity
        issuer: process.env.JWT_ISSUER,      // matches gateway
        audience: process.env.JWT_AUDIENCE,  // matches gateway
    };

    return jwt.sign(payload, process.env.JWT_SECRET, options);
}

// Example usage
/*
const user = { id: '123', email: 'user@example.com', role: 'admin' };
const token = issueToken(user);
console.log(token);
*/

module.exports = { issueToken };