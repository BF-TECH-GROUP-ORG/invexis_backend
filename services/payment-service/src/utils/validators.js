// src/utils/validators.js
// Joi validation schemas for payment endpoints.

const Joi = require('joi');

const paymentInitiationSchema = Joi.object({
    // Identifiers (Support both snake_case and camelCase)
    seller_id: Joi.string().uuid().optional(),
    sellerId: Joi.string().uuid().optional(),
    company_id: Joi.string().uuid().allow(null).optional(),
    companyId: Joi.string().uuid().allow(null).optional(),
    shop_id: Joi.string().uuid().allow(null).optional(),
    shopId: Joi.string().uuid().allow(null).optional(),
    order_id: Joi.string().allow(null).optional(),
    orderId: Joi.string().allow(null).optional(),
    saleId: Joi.string().allow(null).optional(),

    // External Routing / Context
    source: Joi.string().max(50).optional(),
    paymentType: Joi.string().valid('SALE', 'DEBT', 'TIER', 'SUBSCRIPTION', 'ECOMM').optional(),
    type: Joi.string().valid('ECOMM', 'tier_upgrade', 'instant_buy', 'invoice', 'SALE', 'DEBT', 'TIER').optional(),
    referenceId: Joi.string().max(100).optional(),
    reference_id: Joi.string().max(100).optional(),
    idempotencyKey: Joi.string().max(100).optional(),
    idempotency_key: Joi.string().max(100).optional(),

    // Payment Details
    amount: Joi.number().integer().min(1).required(),
    currency: Joi.string().length(3).uppercase().required(),
    description: Joi.string().max(500).required(),
    paymentMethod: Joi.string().valid('card', 'mobile_money', 'bank_transfer', 'cash').required(),
    gateway: Joi.string().valid('mtn_momo', 'airtel_money', 'cash', 'manual').required(),
    phoneNumber: Joi.string().allow('', null).optional(),
    customer: Joi.object({
        name: Joi.string().allow('', null).optional(),
        email: Joi.string().email().allow('', null).optional(),
        phone: Joi.string().allow('', null).optional()
    }).optional(),

    // Optional metadata and items
    lineItems: Joi.array().items(Joi.object().unknown(true)).optional(),
    line_items: Joi.array().items(Joi.object().unknown(true)).optional(),
    metadata: Joi.object().unknown(true).optional(),
    location: Joi.object().optional(),

    // Payout details (for instant buy/split)
    payout_recipient_id: Joi.string().uuid().optional(),
    payout_details: Joi.object({
        method: Joi.string().valid('mobile_money', 'bank_transfer', 'stripe_connect').required(),
        phone_number: Joi.string().optional(),
        bank_account: Joi.object().optional(),
        stripe_account_id: Joi.string().optional(),
        gateway: Joi.string().optional()
    }).optional(),
}).custom((value, helpers) => {
    // Normalization logic can also be placed here, 
    // but we'll do the core cross-field validation.

    const type = value.type || value.paymentType;
    const company_id = value.company_id || value.companyId;

    if ((type === 'tier_upgrade' || type === 'TIER') && !company_id) {
        return helpers.error('any.custom', {
            message: 'company_id is required for tier payments'
        });
    }

    return value;
});

const paymentStatusSchema = Joi.object({
    payment_id: Joi.string().uuid().required()
});

const cancelPaymentSchema = Joi.object({
    payment_id: Joi.string().uuid().required(),
    reason: Joi.string().max(255).optional()
});

const validate = (schema, data) => schema.validate(data, { abortEarly: false });

module.exports = {
    validate,
    paymentInitiationSchema,
    paymentStatusSchema,
    cancelPaymentSchema
};
