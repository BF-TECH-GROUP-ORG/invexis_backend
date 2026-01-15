"use strict";

const { getRedisClient } = require('/app/shared/middlewares/utils/redis');
const { getTierConfig } = require('/app/shared/config/tierFeatures.config');

const CACHE_TTL = 300; // 5 minutes

/**
 * Get company subscription tier
 * @param {string} companyId 
 * @returns {Promise<string>} tier (basic, mid, pro)
 */
async function getCompanyTier(companyId) {
    if (!companyId) return 'Basic';

    const redis = getRedisClient();
    const cacheKey = `company:subscription:${companyId}`;

    try {
        // 1. Try Cache
        const cached = await redis.get(cacheKey);
        if (cached) {
            const sub = JSON.parse(cached);
            let tier = sub.tier || 'Basic';
            // Ensure Title Case
            return tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase();
        }

        // 2. DB Fallback (Mocked for Notification Service independence, or Direct DB access if config allowed)
        // In a strict microservice env, we might default to 'basic' if cache misses and we can't query company DB.
        // However, for robustness, we'll try to look it up if the shared DB config is available.

        // For now, if cache is missing in notification service, we default to BASIC to be safe (fail closed).
        // This enforces "Must have active subscription in cache" to get PRO features.
        console.warn(`Subscription cache miss for ${companyId} in Notification Service. Defaulting to BASIC.`);
        return 'Basic';

    } catch (err) {
        console.error('Error fetching subscription tier:', err.message);
        return 'Basic';
    }
}

/**
 * Filter allowed channels based on tier
 * @param {string} companyId 
 * @param {string[]} requestedChannels 
 * @returns {Promise<string[]>} allowed channels
 */
async function filterAllowedChannels(companyId, requestedChannels) {
    if (!requestedChannels || requestedChannels.length === 0) return [];

    // Always allow in-app
    const alwaysAllowed = ['in-app', 'websocket', 'push'];

    // Check restricted channels
    const restricted = requestedChannels.filter(c => !alwaysAllowed.includes(c));
    if (restricted.length === 0) return requestedChannels;

    const tier = await getCompanyTier(companyId);
    const config = getTierConfig(tier);
    const notificationsConfig = config.features?.notifications || {};

    return requestedChannels.filter(channel => {
        if (alwaysAllowed.includes(channel)) return true;
        if (channel === 'email' && notificationsConfig.email) return true;
        if (channel === 'sms' && notificationsConfig.sms) return true;
        return false;
    });
}

module.exports = {
    getCompanyTier,
    filterAllowedChannels
};
