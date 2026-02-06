const axios = require('axios');

// In-memory cache for company and shop data (5 mins)
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

class InternalServiceClient {
    constructor() {
        this.companyServiceUrl = process.env.COMPANY_SERVICE_URL || 'http://company-service:8004';
        this.shopServiceUrl = process.env.SHOP_SERVICE_URL || 'http://shop-service:9001';
        this.inventoryServiceUrl = process.env.INVENTORY_SERVICE_URL || 'http://inventory-service:8007';
    }

    async getShopData(shopId) {
        if (!shopId) return null;
        const cacheKey = `shop_${shopId}`;
        const cached = cache.get(cacheKey);
        if (cached && cached.expires > Date.now()) return cached.data;

        try {
            const response = await axios.get(`${this.shopServiceUrl}/shop/${shopId}`, {
                headers: { 'X-Internal-Request': 'true' },
                timeout: 5000
            });

            if (response.data?.success && response.data?.data) {
                const data = response.data.data;
                cache.set(cacheKey, { data, expires: Date.now() + CACHE_TTL });
                return data;
            }
        } catch (error) {
            console.error(`[InternalClient] Failed to fetch shop ${shopId}: ${error.message}`);
        }
        return null;
    }

    async getCompanyData(companyId) {
        if (!companyId) return null;
        const cacheKey = `company_${companyId}`;
        const cached = cache.get(cacheKey);
        if (cached && cached.expires > Date.now()) return cached.data;

        try {
            const response = await axios.get(`${this.companyServiceUrl}/company/companies/${companyId}`, {
                headers: { 'X-Internal-Request': 'true' },
                timeout: 5000
            });

            if (response.data?.success && response.data?.data) {
                const data = response.data.data;
                const normalized = {
                    id: data._id || data.id,
                    name: data.name,
                    email: data.email,
                    phone: data.phone,
                    address: data.address || `${data.city || ''}, ${data.country || ''}`,
                    logoUrl: data.metadata?.logo_url
                };
                cache.set(cacheKey, { data: normalized, expires: Date.now() + CACHE_TTL });
                return normalized;
            }
        } catch (error) {
            console.error(`[InternalClient] Failed to fetch company ${companyId}: ${error.message}`);
        }
        return null;
    }

    async getAllCompanies() {
        try {
            const response = await axios.get(`${this.companyServiceUrl}/company/companies`, {
                headers: { 'X-Internal-Request': 'true' },
                params: { limit: 1000 },
                timeout: 10000
            });

            if (response.data?.success && response.data?.data) {
                return response.data.data.map(c => ({
                    id: c._id || c.id,
                    name: c.name,
                    email: c.email
                }));
            }
        } catch (error) {
            console.error(`[InternalClient] Failed to fetch all companies: ${error.message}`);
        }
        return [];
    }

    async getCompanyShops(companyId) {
        try {
            const response = await axios.get(`${this.shopServiceUrl}/shop/company/${companyId}`, {
                headers: { 'X-Internal-Request': 'true' },
                timeout: 5000
            });

            if (response.data?.success && response.data?.data) {
                return response.data.data.map(s => ({
                    id: s._id || s.id,
                    name: s.name,
                    location: s.location || s.address
                }));
            }
        } catch (error) {
            console.error(`[InternalClient] Failed to fetch shops for company ${companyId}: ${error.message}`);
        }
        return [];
    }

    async getProductData(productId) {
        if (!productId) return null;
        const cacheKey = `product_${productId}`;
        const cached = cache.get(cacheKey);
        if (cached && cached.expires > Date.now()) return cached.data;

        try {
            const response = await axios.get(`${this.inventoryServiceUrl}/products/${productId}`, {
                headers: { 'X-Internal-Request': 'true' },
                timeout: 5000
            });

            if (response.data?.success && response.data?.data) {
                const data = response.data.data;
                const normalized = {
                    name: data.name,
                    productName: data.name,
                    categoryId: data.category?.id,
                    categoryName: data.category?.name || 'Uncategorized'
                };
                cache.set(cacheKey, { data: normalized, expires: Date.now() + CACHE_TTL });
                return normalized;
            }
        } catch (error) {
            console.error(`[InternalClient] Failed to fetch product ${productId}: ${error.message}`);
        }
        return null;
    }
}

module.exports = new InternalServiceClient();
