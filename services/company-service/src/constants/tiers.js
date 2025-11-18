/**
 * Company Tier Constants
 * These values MUST match the PostgreSQL ENUM 'company_tier' defined in migrations
 * ENUM values: 'Basic', 'Mid', 'Pro'
 */

const TIERS = {
  BASIC: 'Basic',
  MID: 'Mid',
  PRO: 'Pro',
};

// Array of valid tier values for validation
const VALID_TIERS = Object.values(TIERS);

// Tier display names and descriptions
const TIER_INFO = {
  [TIERS.BASIC]: {
    name: 'Basic Tier',
    description: 'Essential features for small businesses',
    displayOrder: 1,
  },
  [TIERS.MID]: {
    name: 'Mid Tier',
    description: 'Advanced features for growing businesses',
    displayOrder: 2,
  },
  [TIERS.PRO]: {
    name: 'Pro Tier',
    description: 'Premium features for enterprise businesses',
    displayOrder: 3,
  },
};

/**
 * Validate if a tier value is valid
 * @param {string} tier - The tier value to validate
 * @returns {boolean} - True if valid, false otherwise
 */
const isValidTier = (tier) => {
  return VALID_TIERS.includes(tier);
};

/**
 * Normalize tier input (case-insensitive) to match ENUM values
 * @param {string} tier - The tier value to normalize
 * @returns {string|null} - Normalized tier or null if invalid
 */
const normalizeTier = (tier) => {
  if (!tier) return null;
  
  const lowerTier = tier.toLowerCase();
  
  if (lowerTier === 'basic') return TIERS.BASIC;
  if (lowerTier === 'mid') return TIERS.MID;
  if (lowerTier === 'pro') return TIERS.PRO;
  
  // If already in correct format, return as is
  if (VALID_TIERS.includes(tier)) return tier;
  
  return null;
};

module.exports = {
  TIERS,
  VALID_TIERS,
  TIER_INFO,
  isValidTier,
  normalizeTier,
};

