// src/utils/validators.js
// Joi validation schemas for payment endpoints.

const Joi = require('joi');

const paymentInitSchema = Joi.object({
    type: Joi.string().valid('ecom', 'tier_upgrade').optional(),
    amount: Joi.number().positive().precision(2).required(),
    description: Joi.string().max(500).required(),
    paymentMethod: Joi.string().valid('card', 'mobile_money', 'bank_transfer', 'wallet').required(),
    gateway: Joi.string().valid('stripe', 'mtn_momo', 'airtel_money').required(),
    phoneNumber: Joi.string().pattern(/^\+237\d{9}$/).when('paymentMethod', { is: 'mobile_money', then: Joi.required() }),
    customerEmail: Joi.string().email().optional(),
    orderId: Joi.string().uuid().when('type', { is: 'ecom', then: Joi.required() }),
    companyId: Joi.string().uuid().when('type', { is: 'tier_upgrade', then: Joi.required() }),
    lineItems: Joi.array().items(Joi.object({
        productId: Joi.string().uuid(),
        name: Joi.string().max(100),
        quantity: Joi.number().integer().min(1),
        unitPrice: Joi.number().positive().precision(2),
        total: Joi.number().positive().precision(2),
    })).optional().when('type', { is: 'ecom', then: Joi.required() }),
});

const validate = (schema, data) => schema.validate(data, { abortEarly: false });

module.exports = { validate, paymentInitSchema };