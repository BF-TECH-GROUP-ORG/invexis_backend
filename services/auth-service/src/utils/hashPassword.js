const bcrypt = require('bcrypt');
const crypto = require('crypto');

const ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;

async function hashPassword(password) {
    if (!password) throw new Error('Password required');
    return bcrypt.hash(password, ROUNDS);
}

async function comparePassword(password, hash) {
    if (!password || !hash) return false;
    return bcrypt.compare(password, hash);
}

function hashToken(token) {
    if (!token) throw new Error('Token required');
    return crypto.createHmac('sha256', process.env.JWT_REFRESH_SECRET || 'fallback-secret').update(token).digest('hex');
}

module.exports = { hashPassword, comparePassword, hashToken };