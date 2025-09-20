const Joi = require('joi');

const productValidationSchema = Joi.object({
  companyId: Joi.string().required(),
  asin: Joi.string().alphanum().length(10).required(),
  sku: Joi.string().required(),
  title: Joi.string().max(200).required(),
  description: Joi.string().min(50).required(),
  bulletPoints: Joi.array().items(Joi.string().max(500)),
  brand: Joi.string().required(),
  category: Joi.string().required(),
  price: Joi.number().min(0).required(),
  stockQty: Joi.number().min(0).max(process.env.MAX_STOCK_QTY || 1000000).required(),
  condition: Joi.string().valid('new', 'used', 'refurbished').default('new')
});

module.exports = { productValidationSchema };