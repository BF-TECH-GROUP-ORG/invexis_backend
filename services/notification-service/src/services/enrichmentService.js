const axios = require('axios');
const logger = require('../utils/logger');
const redis = require('/app/shared/redis');

// Cache settings
const CACHE_PREFIX = 'enrichment:';
const CACHE_TTL = 300; // 5 minutes in seconds

class EnrichmentService {
    constructor() {
        this.shopServiceUrl = process.env.SHOP_SERVICE_URL || 'http://shop-service:9001';

        // Ensure base URL doesn't have trailing slash or duplicate path if possible
        const rawAuthUrl = process.env.AUTH_SERVICE_URL || 'http://auth-service:8001';
        this.authServiceUrl = rawAuthUrl.replace(/\/$/, '').replace(/\/auth$/, ''); // Strip trailing slash and /auth if present

        this.companyServiceUrl = process.env.COMPANY_SERVICE_URL || 'http://company-service:8004';
    }

    /**
     * Get Company Name by ID
     * @param {string} companyId 
     * @returns {Promise<string>} Company Name or "Unknown Company"
     */
    async getCompanyName(companyId) {
        if (!companyId) return 'Invexis';

        const cacheKey = `${CACHE_PREFIX}company:${companyId}`;
        try {
            const cached = await redis.get(cacheKey);
            if (cached) {
                return cached;
            }
        } catch (err) {
            logger.warn(`Redis cache fetch failed for ${cacheKey}: ${err.message}`);
        }

        try {
            // Using Internal Communication Header
            const response = await axios.get(`${this.companyServiceUrl}/company/companies/${companyId}`, {
                headers: { 'X-Internal-Request': 'true' },
                timeout: 3000
            });

            if (response.data && response.data.data) {
                const name = response.data.data.name;
                await redis.set(cacheKey, name, 'EX', CACHE_TTL);
                return name;
            }
        } catch (error) {
            logger.warn(`Failed to fetch company name for ${companyId}: ${error.message}`);
        }

        return 'Invexis';
    }

    /**
     * Get Shop Name by ID
     * @param {string} shopId 
     * @returns {Promise<string>} Shop Name or "Unknown Shop"
     */
    async getShopName(shopId) {
        if (!shopId) return 'Unknown Shop';
        if (shopId === 'all') return 'All Shops';

        const cacheKey = `${CACHE_PREFIX}shop:${shopId}`;
        try {
            const cached = await redis.get(cacheKey);
            if (cached) {
                return cached;
            }
        } catch (err) {
            logger.warn(`Redis cache fetch failed for ${cacheKey}: ${err.message}`);
        }

        try {
            // Using Internal Communication Header
            const response = await axios.get(`${this.shopServiceUrl}/shop/${shopId}`, {
                headers: { 'X-Internal-Request': 'true' },
                timeout: 3000
            });

            if (response.data) {
                const shopData = response.data.data || response.data;
                const name = shopData.name;

                if (name) {
                    await redis.set(cacheKey, name, 'EX', CACHE_TTL);
                    return name;
                }
            }
        } catch (error) {
            logger.warn(`Failed to fetch shop name for ${shopId}: ${error.message}`);
        }

        return 'Unknown Shop';
    }

    /**
     * Get User Name by ID
     * @param {string} userId 
     * @returns {Promise<string>} User Name or "Unknown User"
     */
    async getUserName(userId) {
        if (!userId) return 'Unknown User';
        if (userId === 'system') return 'System';

        const cacheKey = `${CACHE_PREFIX}user:${userId}`;
        try {
            const cached = await redis.get(cacheKey);
            if (cached) {
                return cached;
            }
        } catch (err) {
            logger.warn(`Redis cache fetch failed for ${cacheKey}: ${err.message}`);
        }

        try {
            // Using Internal Communication Header
            const response = await axios.get(`${this.authServiceUrl}/auth/users/${userId}`, {
                headers: { 'X-Internal-Request': 'true' },
                timeout: 3000
            });

            if (response.data && response.data.data) {
                const user = response.data.data;
                const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.name || 'User';
                await redis.set(cacheKey, name, 'EX', CACHE_TTL);
                return name;
            }
        } catch (error) {
            // 404 is common for system/deleted users, so ignore it.
            if (!error.response || error.response.status !== 404) {
                logger.warn(`Failed to fetch user name for ${userId}: ${error.message}`);
            }
        }

        return 'Unknown User';
    }
}

module.exports = new EnrichmentService();
