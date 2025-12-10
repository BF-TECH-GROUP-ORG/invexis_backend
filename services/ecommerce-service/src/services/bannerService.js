const { FeaturedBannerRepository } = require('../repositories');
const { publish, exchanges } = require('/app/shared/rabbitmq');

const cache = require('../utils/cache');

async function createBanner(companyId, data) {
    data.companyId = companyId;
    const b = await FeaturedBannerRepository.create(data);
    try { await publish(exchanges.topic, 'ecommerce.banner.created', b); } catch (e) { }
    await cache.del(`banners:company:${companyId}`);
    return b;
}

async function getBanners(companyId, opts = {}) {
    const key = `banners:company:${companyId}:opts:${JSON.stringify(opts)}`;
    const cached = await cache.getJSON(key);
    if (cached) return cached;
    const q = { companyId, ...opts.filter };
    const banners = await FeaturedBannerRepository.list(q, opts);
    const total = banners.length; // simple
    const res = { banners, pagination: { total, page: opts.page || 1, limit: opts.limit || 10 } };
    await cache.setJSON(key, res, 60);
    return res;
}

async function getBannerById(bannerId, companyId) {
    const key = `banner:${companyId}:${bannerId}`;
    const cached = await cache.getJSON(key);
    if (cached) return cached;
    const b = await FeaturedBannerRepository.findById(bannerId, companyId);
    if (!b) throw new Error('not found');
    await cache.setJSON(key, b);
    return b;
}

async function updateBanner(bannerId, companyId, patch) {
    const b = await FeaturedBannerRepository.update(bannerId, companyId, patch);
    if (!b) throw new Error('not found');
    try { await publish(exchanges.topic, 'ecommerce.banner.updated', b); } catch (e) { }
    await cache.del(`banner:${companyId}:${bannerId}`);
    await cache.del(`banners:company:${companyId}`);
    return b;
}

async function deleteBanner(bannerId, companyId) {
    const b = await FeaturedBannerRepository.update(bannerId, companyId, { isDeleted: true });
    if (!b) throw new Error('not found');
    try { await publish(exchanges.topic, 'ecommerce.banner.deleted', { bannerId, companyId }); } catch (e) { }
    await cache.del(`banner:${companyId}:${bannerId}`);
    await cache.del(`banners:company:${companyId}`);
    return b;
}

async function toggleActive(bannerId, companyId, isActive) {
    const b = await FeaturedBannerRepository.update(bannerId, companyId, { isActive });
    if (!b) throw new Error('not found');
    try { await publish(exchanges.topic, 'ecommerce.banner.toggled', { bannerId, companyId, isActive }); } catch (e) { }
    await cache.del(`banner:${companyId}:${bannerId}`);
    await cache.del(`banners:company:${companyId}`);
    return b;
}

module.exports = { createBanner, getBanners, getBannerById, updateBanner, deleteBanner, toggleActive };
