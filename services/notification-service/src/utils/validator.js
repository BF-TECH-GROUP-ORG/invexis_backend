// src/utils/validator.js
const Joi = require('joi');

const notificationEventSchema = Joi.object({
    event: Joi.string().required(),
    data: Joi.object().required(),
    recipients: Joi.array().items(Joi.string()).optional(),
    companyId: Joi.string().required(),
    templateName: Joi.string().required(),
    channels: Joi.alternatives().try(
        Joi.array().items(Joi.string()),
        Joi.object({
            email: Joi.boolean().default(false),
            sms: Joi.boolean().default(false),
            push: Joi.boolean().default(false),
            inApp: Joi.boolean().default(true)
        })
    ).optional(),
    scope: Joi.string().optional(),
    departmentId: Joi.string().optional(),
    roles: Joi.array().items(Joi.string()).optional(),
    priority: Joi.string().optional()
});

const preferenceSchema = Joi.object({
    userId: Joi.string().required(),
    companyId: Joi.string().required(),
    preferences: Joi.object({
        email: Joi.boolean().default(true),
        sms: Joi.boolean().default(true),
        push: Joi.boolean().default(true),
        inApp: Joi.boolean().default(true)
    })
});

module.exports = { notificationEventSchema, preferenceSchema };