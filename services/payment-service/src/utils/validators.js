// src/utils/validators.js
// Joi validation schemas for payment endpoints.

const Joi = require('joi');

const paymentInitiationSchema = Joi.object({
    user_id: Joi.string().uuid().required(),
    seller_id: Joi.string().uuid().required(),
    payout_recipient_id: Joi.string().uuid().optional(),
    company_id: Joi.string().uuid().allow(null).optional(),
    shop_id: Joi.string().uuid().allow(null).optional(),
    order_id: Joi.string().uuid().allow(null).optional(),
    type: Joi.string().valid('ecom', 'tier_upgrade', 'instant_buy', 'invoice').optional(),
    amount: Joi.number().integer().min(1).required(),
    currency: Joi.string().length(3).uppercase().required(),
    description: Joi.string().max(500).required(),
    paymentMethod: Joi.string().valid('card', 'mobile_money', 'bank_transfer').required(),
    gateway: Joi.string().valid('stripe', 'mtn_momo', 'airtel_money', 'mpesa').required(),
    phoneNumber: Joi.string().when('paymentMethod', {
        is: 'mobile_money',
        then: Joi.required(),
        otherwise: Joi.optional()
    }),
    customerEmail: Joi.string().email().optional(),
    lineItems: Joi.array().items(
        Joi.object({
            product_id: Joi.string().uuid().optional(),
            name: Joi.string().required(),
            description: Joi.string().optional(),
            quantity: Joi.number().integer().min(1).required(),
            unit_price: Joi.number().integer().min(0).optional(),
            unitPrice: Joi.number().integer().min(0).optional(),
            total: Joi.number().integer().min(0).required()
        })
    ).optional(),
    payout_details: Joi.object({
        method: Joi.string().valid('mobile_money', 'bank_transfer', 'stripe_connect').required(),
        phone_number: Joi.string().when('method', {
            is: 'mobile_money',
            then: Joi.required(),
            otherwise: Joi.optional()
        }),
        bank_account: Joi.object({
            account_number: Joi.string().required(),
            account_name: Joi.string().required(),
            bank_name: Joi.string().required(),
            bank_code: Joi.string().optional()
        }).when('method', {
            is: 'bank_transfer',
            then: Joi.required(),
            otherwise: Joi.optional()
        }),
        stripe_account_id: Joi.string().when('method', {
            is: 'stripe_connect',
            then: Joi.required(),
            otherwise: Joi.optional()
        }),
        gateway: Joi.string().valid('mtn_momo', 'airtel_money', 'mpesa', 'stripe').optional()
    }).optional(),
    metadata: Joi.object().optional()
}).custom((value, helpers) => {
    // For tier upgrades: require company_id, payout goes to platform
    if (value.type === 'tier_upgrade') {
        if (!value.company_id) {
            return helpers.error('any.custom', {
                message: 'company_id is required for tier_upgrade payments'
            });
        }
    } else if (value.type === 'ecom' || value.type === 'instant_buy') {
        // For ecom and instant_buy: require both company_id and shop_id
        if (!value.company_id) {
            return helpers.error('any.custom', {
                message: 'company_id is required for e-commerce and instant buy payments'
            });
        }
        if (!value.shop_id) {
            return helpers.error('any.custom', {
                message: 'shop_id is required for e-commerce and instant buy payments'
            });
        }
        // For instant payouts, require payout details
        if (value.payout_recipient_id && !value.payout_details) {
            return helpers.error('any.custom', {
                message: 'payout_details is required when payout_recipient_id is provided'
            });
        }
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
