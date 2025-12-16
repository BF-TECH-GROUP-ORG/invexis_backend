const bcrypt = require('bcrypt');
const crypto = require('crypto');

const ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;

async function hashPassword(password) {
    if (!password) throw new Error('Password required');
    return bcrypt.hash(password, ROUNDS);
}

async function comparePassword(password, hash) {
    console.log('Comparing password:', { passwordProvided: !!password, hashProvided: !!hash });
    if (!password || !hash) {
        console.log('Missing password or hash');
        return false;
    }
    try {
        const result = await bcrypt.compare(password, hash);
        console.log('Password comparison result:', result);
        return result;
    } catch (error) {
        console.error('Error comparing passwords:', error);
        return false;
    }
}

function hashToken(token) {
    if (!token) throw new Error('Token required');
    return crypto.createHmac('sha256', process.env.JWT_REFRESH_SECRET || 'fallback-secret').update(token).digest('hex');
}

module.exports = { hashPassword, comparePassword, hashToken };