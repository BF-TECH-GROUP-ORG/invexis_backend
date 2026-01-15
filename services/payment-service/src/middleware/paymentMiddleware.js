const knex = require('knex')(require('../../knexfile')[process.env.NODE_ENV || 'development']);
const redis = require('/app/shared/redis');
const crypto = require('crypto');
const Stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// 1. Idempotency Check (key: identifier + idempotencyKey from header/body)
const idempotencyCheck = async (req, res, next) => {
    const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;
    if (!idempotencyKey) return res.status(400).json({ success: false, message: 'Idempotency key required' });

    const identifier = req.user?.id || req.ip;
    const cacheKey = `idempotency:${identifier}:${idempotencyKey}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
        return res.json(JSON.parse(cached));  // Return cached response
    }

    // Store middleware response in res.locals for post-controller set
    res.locals.idempotencyKey = idempotencyKey;
    res.locals.cacheKey = cacheKey;
    next();
};

// Middleware to cache response after controller (call in controller end)
const cacheIdempotencyResponse = (req, res, next) => {
    if (res.locals.cacheKey) {
        redis.set(res.locals.cacheKey, JSON.stringify(res.locals.response), 'EX', 3600);  // 1 hour
    }
    next();
};

const rateLimitPayments = (max = 10, window = 3600) => async (req, res, next) => {
    const identifier = req.user?.id || req.ip;
    const key = `rate:payments:${identifier}`;
    const current = parseInt(await redis.get(key) || 0);
    if (current >= max) return res.status(429).json({ success: false, message: 'Rate limit exceeded' });

    await redis.incr(key);
    await redis.expire(key, window);
    next();
};

// 3. Webhook Signature Validation (for Stripe; extend for MTN/Airtel)
const validateWebhookSignature = (gateway) => (req, res, next) => {
    let signature;
    if (gateway === 'stripe') {
        signature = req.headers['stripe-signature'];
        try {
            const event = Stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
            req.webhookEvent = event;
            next();
        } catch (e) {
            return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
        }
    } else if (gateway === 'mtn') {
        // MTN: Basic auth or hash check (adapt to API docs)
        const expectedHash = crypto.createHmac('sha256', process.env.MTN_WEBHOOK_SECRET).update(JSON.stringify(req.body)).digest('hex');
        if (req.headers['x-mtn-signature'] !== expectedHash) {
            return res.status(400).json({ success: false, message: 'Invalid MTN webhook signature' });
        }
        next();
    } else if (gateway === 'airtel') {
        // Airtel: Token or hash
        const expectedHash = crypto.createHmac('sha256', process.env.AIRTEL_WEBHOOK_SECRET).update(JSON.stringify(req.body)).digest('hex');
        if (req.headers['x-airtel-signature'] !== expectedHash) {
            return res.status(400).json({ success: false, message: 'Invalid Airtel webhook signature' });
        }
        next();
    }
};

module.exports = { idempotencyCheck, cacheIdempotencyResponse, rateLimitPayments, validateWebhookSignature };