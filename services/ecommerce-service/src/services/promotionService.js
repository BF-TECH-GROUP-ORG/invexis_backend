const { PromotionRepository } = require('../repositories');
const { publish, exchanges } = require('/app/shared/rabbitmq');

const cache = require('../utils/cache');

async function listPromotions(companyId, opts = {}) {
    const key = `promotions:company:${companyId}:active:${opts.active ? '1' : '0'}`;
    const cached = await cache.getJSON(key);
    if (cached) return cached;
    const res = opts.active ? await PromotionRepository.findActive(companyId) : await PromotionRepository.findActive(companyId);
    await cache.setJSON(key, res, 60);
    return res;
}

async function getPromotion(promotionId, companyId) {
    const key = `promotion:${companyId}:${promotionId}`;
    const cached = await cache.getJSON(key);
    if (cached) return cached;
    const p = await PromotionRepository.findById(promotionId);
    if (!p || p.companyId !== companyId) throw new Error('not found');
    await cache.setJSON(key, p);
    return p;
}

async function createPromotion(companyId, data) {
    data.companyId = companyId;
    const p = await PromotionRepository.create(data);
    try { await publish(exchanges.topic, 'ecommerce.promotion.created', p); } catch (e) { }
    // invalidate company promotions cache
    await cache.del(`promotions:company:${companyId}:active:1`);
    return p;
}

async function updatePromotion(promotionId, companyId, patch) {
    const p = await PromotionRepository.update(promotionId, patch);
    if (!p || p.companyId !== companyId) throw new Error('not found');
    try { await publish(exchanges.topic, 'ecommerce.promotion.updated', p); } catch (e) { }
    await cache.del(`promotion:${companyId}:${promotionId}`);
    await cache.del(`promotions:company:${companyId}:active:1`);
    return p;
}

async function deletePromotion(promotionId, companyId) {
    const p = await PromotionRepository.update(promotionId, { isDeleted: true });
    if (!p || p.companyId !== companyId) throw new Error('not found');
    try { await publish(exchanges.topic, 'ecommerce.promotion.deleted', { promotionId, companyId }); } catch (e) { }
    await cache.del(`promotion:${companyId}:${promotionId}`);
    await cache.del(`promotions:company:${companyId}:active:1`);
    return p;
}

module.exports = { listPromotions, getPromotion, createPromotion, updatePromotion, deletePromotion };
