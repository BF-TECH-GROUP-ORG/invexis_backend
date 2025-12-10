// utils/hashedId.js
// Helper to validate hashedCustomerId format expected from sales-service.
// We expect a version prefix (e.g. v1$) followed by 64 hex chars (sha256 HMAC).

function isValidHashedCustomerId(id) {
    if (!id || typeof id !== 'string') return false;
    // allow prefixes like v1$, v2$ etc. hex length 64 for sha256
    const re = /^v\d+\$[0-9a-f]{64}$/i;
    return re.test(id);
}

module.exports = { isValidHashedCustomerId };
