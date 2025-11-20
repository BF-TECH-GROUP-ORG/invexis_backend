const Joi = require('joi');

const localizedStringSchema = Joi.object().pattern(/.*/, Joi.string()).min(1).required();

const cartItemSchema = Joi.object({
  productId: Joi.string().required(),
  quantity: Joi.number().integer().min(1).required(),
  priceAtAdd: Joi.number().min(0).required(),
  currency: Joi.string().required(),
  metadata: Joi.object().optional()
});

const cartSchema = Joi.object({
  companyId: Joi.string().required(),
  userId: Joi.string().required(),
  shopId: Joi.string().optional(),
  items: Joi.array().items(cartItemSchema).required(),
  status: Joi.string().valid('active', 'checked_out', 'abandoned').optional(),
  lastActivity: Joi.date().optional(),
  isDeleted: Joi.boolean().optional(),
  metadata: Joi.object().optional()
});

const orderItemSchema = Joi.object({
  productId: Joi.string().required(),
  quantity: Joi.number().integer().min(1).required(),
  priceAtOrder: Joi.number().min(0).required(),
  currency: Joi.string().required(),
  metadata: Joi.object().optional()
});

const orderSchema = Joi.object({
  orderId: Joi.string().required(),
  userId: Joi.string().required(),
  companyId: Joi.string().required(),
  shopId: Joi.string().optional(),
  items: Joi.array().items(orderItemSchema).min(1).required(),
  subtotal: Joi.number().min(0).required(),
  totalAmount: Joi.number().min(0).required(),
  currency: Joi.string().required(),
  shippingAmount: Joi.number().min(0).optional(),
  taxes: Joi.number().min(0).optional(),
  status: Joi.string().valid('pending', 'confirmed', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded').optional(),
  paymentStatus: Joi.string().valid('unpaid', 'processing', 'paid', 'failed', 'refunded').optional(),
  payment: Joi.object().optional(),
  shippingAddress: Joi.object().optional(),
  billingAddress: Joi.object().optional(),
  createdBy: Joi.string().optional(),
  updatedBy: Joi.string().optional(),
  isDeleted: Joi.boolean().optional(),
  deletedAt: Joi.date().optional(),
  retentionExpiresAt: Joi.date().optional(),
  metadata: Joi.object().optional()
});

const promotionSchema = Joi.object({
  promotionId: Joi.string().required(),
  companyId: Joi.string().required(),
  shopId: Joi.string().optional(),
  name: Joi.string().required(),
  code: Joi.string().optional(),
  discountType: Joi.string().valid('percentage', 'fixed', 'free_shipping').required(),
  discountValue: Joi.number().min(0).required(),
  description: Joi.string().optional(),
  startAt: Joi.date().required(),
  endAt: Joi.date().required(),
  usageLimit: Joi.number().integer().min(0).optional(),
  usedCount: Joi.number().integer().min(0).optional(),
  perCustomerLimit: Joi.number().integer().min(0).optional(),
  constraints: Joi.object().optional(),
  status: Joi.string().valid('active', 'expired', 'disabled').optional(),
  isDeleted: Joi.boolean().optional(),
  metadata: Joi.object().optional()
});

const reviewSchema = Joi.object({
  reviewId: Joi.string().required(),
  userId: Joi.string().required(),
  productId: Joi.string().required(),
  companyId: Joi.string().required(),
  rating: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().optional(),
  isApproved: Joi.boolean().optional(),
  flagged: Joi.boolean().optional(),
  createdBy: Joi.string().optional(),
  updatedBy: Joi.string().optional(),
  isDeleted: Joi.boolean().optional(),
  metadata: Joi.object().optional()
});

const wishlistItemSchema = Joi.object({
  productId: Joi.string().required(),
  addedAt: Joi.date().optional()
});

const wishlistSchema = Joi.object({
  userId: Joi.string().required(),
  companyId: Joi.string().required(),
  shopId: Joi.string().optional(),
  items: Joi.array().items(wishlistItemSchema).required(),
  isDeleted: Joi.boolean().optional(),
  metadata: Joi.object().optional()
});

const bannerSchema = Joi.object({
  bannerId: Joi.string().optional(), // Generated if not provided
  companyId: Joi.string().required(),
  shopId: Joi.string().optional(),
  title: localizedStringSchema,
  subtitle: localizedStringSchema.optional(),
  imageUrl: Joi.string().uri().required(),
  target: Joi.object().required(),
  type: Joi.string().valid('homepage', 'seasonal', 'product_highlight').optional().default('homepage'),
  priority: Joi.number().integer().optional().default(0),
  startAt: Joi.date().optional(),
  endAt: Joi.date().optional(),
  isActive: Joi.boolean().optional().default(true),
  isDeleted: Joi.boolean().optional(),
  metadata: Joi.object().optional()
});

const productSchema = Joi.object({
  productId: Joi.string().required(),
  companyId: Joi.string().required(),
  shopId: Joi.string().optional(),
  title: localizedStringSchema,
  shortDescription: localizedStringSchema.optional(),
  longDescription: localizedStringSchema.optional(),
  price: Joi.number().min(0).required(),
  currency: Joi.string().required(),
  images: Joi.array().items(
    Joi.object({
      url: Joi.string().uri().required(),
      alt: localizedStringSchema.optional()
    })
  ).optional(),
  seo: Joi.object({
    slug: Joi.string().optional(),
    metaTitle: localizedStringSchema.optional(),
    metaDescription: localizedStringSchema.optional()
  }).optional(),
  compareAtPrice: Joi.number().min(0).optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  featured: Joi.boolean().optional(),
  visibility: Joi.string().valid('public', 'private', 'unlisted').optional(),
  status: Joi.string().valid('active', 'inactive', 'archived').optional(),
  createdBy: Joi.string().optional(),
  updatedBy: Joi.string().optional(),
  isDeleted: Joi.boolean().optional(),
  deletedAt: Joi.date().optional(),
  defaultLocale: Joi.string().optional(),
  defaultCurrency: Joi.string().optional(),
  metadata: Joi.object().optional()
});

module.exports = {
  cartSchema,
  orderSchema,
  promotionSchema,
  reviewSchema,
  wishlistSchema,
  bannerSchema,
  productSchema
};