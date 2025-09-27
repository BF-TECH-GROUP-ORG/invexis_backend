// src/utils/hashPassword.js
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

async function hashPassword(plain) {
    return bcrypt.hash(plain, saltRounds);
}

async function comparePassword(plain, hash) {
    return bcrypt.compare(plain, hash);
}

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = { hashPassword, comparePassword, hashToken };
