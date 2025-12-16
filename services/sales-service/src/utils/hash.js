const crypto = require('crypto');

// Simple HMAC-based hashing helper for customer identifiers in sales-service.
// Uses HMAC_SECRET env var (shared across services). If not present, falls back
// to a dev default. This should match the behaviour in debt-service so that
// hashedCustomerId is consistent between services.

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
