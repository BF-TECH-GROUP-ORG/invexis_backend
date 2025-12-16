const crypto = require('crypto');

// HMAC-based hashing helper for customer identifiers.
// Uses HMAC_SECRET env var. If not present, falls back to a noop hashed string (not recommended for prod).

function getSecret() {
    return process.env.HMAC_SECRET || 'dev-default-secret-please-change';
}

function hashIdentifier(identifier) {
    if (!identifier) return null;
    const h = crypto.createHmac('sha256', getSecret());
    h.update(String(identifier));
    return h.digest('hex');
}

module.exports = { hashIdentifier };
