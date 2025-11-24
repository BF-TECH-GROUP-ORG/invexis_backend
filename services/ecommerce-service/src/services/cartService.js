const { CartRepository } = require('../repositories');
const redis = require('/app/shared/redis');
const { publish, exchanges } = require('/app/shared/rabbitmq');

const CACHE_TTL = 300; // seconds

function cacheKey(companyId, userId, cartId) {
    if (userId) return `cart:${companyId}:${userId}`;
    return `cart:${companyId}:guest:${cartId}`;
}

async function getCart(companyId, userId) {
    const key = cacheKey(companyId, userId);
    try {
        const cached = await redis.get(key);
        if (cached) return JSON.parse(cached);
    } catch (err) {
        // fallthrough to DB
    }

    const cart = await CartRepository.findActiveByCompanyAndUser(companyId, userId);
    if (!cart) return null;
    try { await redis.set(key, JSON.stringify(cart), 'EX', CACHE_TTL); } catch (e) { }
    return cart;
}

async function createCart(data) {
    const cart = await CartRepository.create(data);
    const key = cacheKey(cart.companyId, cart.userId, cart._id);
    try { await redis.set(key, JSON.stringify(cart), 'EX', CACHE_TTL); } catch (e) { }
    // publish event
    try { await publish(exchanges.topic, 'ecommerce.cart.created', cart); } catch (e) { }
    return cart;
}

async function addItem(companyId, userId, item) {
    // find or create cart
    let cart = await CartRepository.findActiveByCompanyAndUser(companyId, userId);
    if (!cart) {
        cart = await CartRepository.create({ companyId, userId, items: [item], lastActivity: new Date() });
    } else {
        // merge item (simple logic: if same productId, increase quantity)
        const idx = cart.items.findIndex(i => i.productId === item.productId);
        if (idx >= 0) {
            cart.items[idx].quantity += item.quantity;
            cart.items[idx].priceAtAdd = item.priceAtAdd || cart.items[idx].priceAtAdd;
        } else {
            cart.items.push(item);
        }
        cart.lastActivity = new Date();
        cart = await CartRepository.update(cart._id, cart);
    }

    // invalidate cache and repopulate
    const key = cacheKey(companyId, userId, cart._id);
    try { await redis.del(key); await redis.set(key, JSON.stringify(cart), 'EX', CACHE_TTL); } catch (e) { }
    try { await publish(exchanges.topic, 'ecommerce.cart.updated', cart); } catch (e) { }
    return cart;
}

async function removeItem(companyId, userId, productId) {
    const cart = await CartRepository.findActiveByCompanyAndUser(companyId, userId);
    if (!cart) return null;
    const newItems = cart.items.filter(i => i.productId !== productId);
    cart.items = newItems;
    cart.lastActivity = new Date();
    const updated = await CartRepository.update(cart._id, cart);
    const key = cacheKey(companyId, userId, cart._id);
    try { await redis.del(key); await redis.set(key, JSON.stringify(updated), 'EX', CACHE_TTL); } catch (e) { }
    try { await publish(exchanges.topic, 'ecommerce.cart.updated', updated); } catch (e) { }
    return updated;
}

async function addOrUpdateCart(userId, companyId, value) {
    // value expected to be a full cart body or minimal items
    // if items present, we merge/add them
    if (value.items && Array.isArray(value.items) && value.items.length) {
        // apply items one by one using addItem logic
        let cart = await CartRepository.findActiveByCompanyAndUser(companyId, userId);
        if (!cart) {
            cart = await CartRepository.create({ companyId, userId, items: value.items, lastActivity: new Date() });
        } else {
            for (const it of value.items) {
                const idx = cart.items.findIndex(i => i.productId === it.productId);
                if (idx >= 0) cart.items[idx].quantity += it.quantity;
                else cart.items.push(it);
            }
            cart.lastActivity = new Date();
            cart = await CartRepository.update(cart._id, cart);
        }
        const key = cacheKey(companyId, userId, cart._id);
        try { await redis.del(key); await redis.set(key, JSON.stringify(cart), 'EX', CACHE_TTL); } catch (e) { }
        try { await publish(exchanges.topic, 'ecommerce.cart.updated', cart); } catch (e) { }
        return cart;
    }

    // otherwise, create/update full cart document
    let cart = await CartRepository.findActiveByCompanyAndUser(companyId, userId);
    if (!cart) cart = await CartRepository.create(Object.assign({ companyId, userId }, value));
    else cart = await CartRepository.update(cart._id, value);
    const key = cacheKey(companyId, userId, cart._id);
    try { await redis.del(key); await redis.set(key, JSON.stringify(cart), 'EX', CACHE_TTL); } catch (e) { }
    try { await publish(exchanges.topic, 'ecommerce.cart.updated', cart); } catch (e) { }
    return cart;
}

async function checkoutCart(userId, companyId) {
    // Mark active cart as checked_out and publish an event. Orders creation lives elsewhere.
    const cart = await CartRepository.findActiveByCompanyAndUser(companyId, userId);
    if (!cart) throw new Error('Cart not found');
    const updated = await CartRepository.update(cart._id, { status: 'checked_out', lastActivity: new Date() });
    const key = cacheKey(companyId, userId, updated._id);
    try { await redis.del(key); } catch (e) { }
    try { await publish(exchanges.topic, 'ecommerce.cart.checked_out', updated); } catch (e) { }

    // Also emit a payment request event so Payments service can initiate payment flow
    try {
        // compute amount (use cart.total if available, otherwise derive)
        let amount = updated.total;
        let currency = updated.currency;
        if (amount === undefined || amount === null) {
            amount = 0;
            currency = currency || (updated.items && updated.items[0] && updated.items[0].currency) || 'USD';
            if (Array.isArray(updated.items)) {
                for (const it of updated.items) {
                    const price = (it.priceAtAdd || 0) - (it.discount || 0) + (it.tax || 0);
                    amount += price * (it.quantity || 1);
                }
            }
        }

        const paymentPayload = {
            companyId,
            userId: userId || null,
            cartId: updated._id,
            amount,
            currency,
            timestamp: Date.now()
        };
        await publish(exchanges.topic, 'ecommerce.payment.request', paymentPayload);
    } catch (e) {
        // don't fail checkout if payment publish fails; log and continue
        console.error('checkoutCart: failed to publish payment.request', e.message);
    }

    return updated;
}

module.exports = { getCart, createCart, addItem, removeItem, addOrUpdateCart, checkoutCart };
