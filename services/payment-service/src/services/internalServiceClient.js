const axios = require('axios');
const logger = require('../utils/logger');

// In-memory cache for company data to minimize latency
// Key: companyId -> Value: { data, expires }
const companyCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

class InternalServiceClient {
    constructor() {
        this.companyServiceUrl = process.env.COMPANY_SERVICE_URL || 'http://company-service:8004';
        this.shopServiceUrl = process.env.SHOP_SERVICE_URL || 'http://shop-service:9001';
    }

    /**
     * Get shop data from shop-service
     * @param {string} shopId - Shop UUID/ID
     * @returns {Promise<Object|null>} Shop data
     */
    async getShopData(shopId) {
        if (!shopId) return null;

        try {
            logger.info(`Fetching shop data via internal call: ${shopId}`);
            const response = await axios.get(`${this.shopServiceUrl}/shop/${shopId}`, {
                headers: { 'X-Internal-Request': 'true' },
                timeout: 5000
            });

            if (response.data && response.data.success && response.data.data) {
                return response.data.data;
            }
        } catch (error) {
            logger.error(`Failed to fetch shop data from internal service: ${error.message}`, { shopId });
        }
        return null;
    }

    /**
     * Get company settings from company-service
     * @param {string} companyId - Company UUID
     * @returns {Promise<Object|null>} Company data
     */
    async getCompanySettings(companyId) {
        if (!companyId) return null;

        // 1. Check Cache
        const cached = companyCache.get(companyId);
        if (cached && cached.expires > Date.now()) {
            return cached.data;
        }

        try {
            // 2. Fetch from Company Service
            logger.info(`Fetching company settings via internal call: ${companyId}`);

            const response = await axios.get(`${this.companyServiceUrl}/company/companies/${companyId}`, {
                headers: { 'X-Internal-Request': 'true' },
                timeout: 5000
            });

            if (response.data && response.data.success && response.data.data) {
                const companyData = response.data.data;

                // Map the data to a standard format used by payment-service
                // payment-service expects fields like mpsesa_phone, etc but these are in payment_phones in company-service
                const normalizedData = this._normalizeCompanyData(companyData);

                // 3. Update Cache
                companyCache.set(companyId, {
                    data: normalizedData,
                    expires: Date.now() + CACHE_TTL
                });

                return normalizedData;
            }
        } catch (error) {
            logger.error(`Failed to fetch company data from internal service: ${error.message}`, { companyId });
        }

        return null;
    }

    /**
     * Normalize company data from company-service into payment-service compatible object
     * @param {Object} rawData - Data from company-service
     * @returns {Object} Normalized settings
     */
    _normalizeCompanyData(rawData) {
        const phones = typeof rawData.payment_phones === 'string'
            ? JSON.parse(rawData.payment_phones)
            : rawData.payment_phones || [];

        const profile = typeof rawData.payment_profile === 'string'
            ? JSON.parse(rawData.payment_profile)
            : rawData.payment_profile || {};

        return {
            company_id: rawData.id,
            company_name: rawData.name,
            company_email: rawData.email,
            company_phone: rawData.phone,
            company_address: rawData.address || `${rawData.city || ''}, ${rawData.country || ''}`,
            momo_phone: phones.find(p => p.provider === 'MTN' && p.enabled)?.phoneNumber || null,
            airtel_phone: phones.find(p => p.provider === 'Airtel' && p.enabled)?.phoneNumber || null,
            mpesa_phone: phones.find(p => p.provider === 'MPESA' && p.enabled)?.phoneNumber || null,
            stripe_account_id: profile.stripe?.connectAccountId || null,
            metadata: {
                logo_url: rawData.metadata?.logo_url,
                tier: rawData.tier,
                ...rawData.metadata
            }
        };
    }
}

module.exports = new InternalServiceClient();
