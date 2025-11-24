const Joi = require('joi');

const localizedStringSchema = Joi.object().pattern(/.*/, Joi.string()).min(1).required();

const mediaSchema = Joi.object({
  url: Joi.string().uri().required(),
  alt: Joi.string().optional(),
  isPrimary: Joi.boolean().optional(),
  sortOrder: Joi.number().integer().optional()
});

const addressSchema = Joi.object({
  name: Joi.string().optional(),
  street: Joi.string().optional(),
  city: Joi.string().optional(),
  state: Joi.string().optional(),
  postalCode: Joi.string().optional(),
  country: Joi.string().optional(),
  phone: Joi.string().optional()
});

const timelineSchema = Joi.object({
  status: Joi.string().required(),
  description: Joi.string().optional(),
  timestamp: Joi.date().default(Date.now),
  location: Joi.string().optional()
});

const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  sortBy: Joi.string().optional(),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

const cartItemSchema = Joi.object({
  productId: Joi.string().required(),
  quantity: Joi.number().integer().min(1).required(),
  priceAtAdd: Joi.number().min(0).required(),
  currency: Joi.string().required(),
  discount: Joi.number().default(0),
  tax: Joi.number().default(0),
  metadata: Joi.object().optional()
});

const cartSchema = Joi.object({
  userId: Joi.string().optional(),
  items: Joi.array().items(cartItemSchema).default([]),
  total: Joi.number().default(0),
  currency: Joi.string().default('USD'),
  discount: Joi.number().default(0),
  tax: Joi.number().default(0),
  status: Joi.string().valid('active', 'checked_out', 'abandoned').default('active'),
  lastActivity: Joi.date().default(Date.now)
});

const orderItemSchema = Joi.object({
  productId: Joi.string().required(),
  quantity: Joi.number().integer().min(1).required(),
  priceAtOrder: Joi.number().min(0).required(),
  currency: Joi.string().required(),
  metadata: Joi.object().optional()
});

const paymentSchema = Joi.object({
  paymentRef: Joi.string().optional(),
  provider: Joi.string().optional(),
  providerMetadata: Joi.object().optional()
});

const orderSchema = Joi.object({
  orderId: Joi.string().required(),
  userId: Joi.string().required(),
  items: Joi.array().items(orderItemSchema).required(),
  subtotal: Joi.number().required(),
  shippingAmount: Joi.number().default(0),
  taxes: Joi.number().default(0),
  totalAmount: Joi.number().required(),
  currency: Joi.string().required(),
  status: Joi.string().valid('pending', 'confirmed', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded').default('pending'),
  paymentStatus: Joi.string().valid('unpaid', 'processing', 'paid', 'failed', 'refunded').default('unpaid'),
  payment: paymentSchema.optional(),
  shippingAddress: addressSchema.optional(),
  billingAddress: addressSchema.optional(),
  createdBy: Joi.string().optional(),
  updatedBy: Joi.string().optional()
});

const promotionSchema = Joi.object({
  promotionId: Joi.string().required(),
  name: Joi.string().required(),
  code: Joi.string().optional(),
  discountType: Joi.string().valid('percentage', 'fixed', 'free_shipping').required(),
  discountValue: Joi.number().required(),
  startAt: Joi.date().required(),
  endAt: Joi.date().required(),
  relatedProductIds: Joi.array().items(Joi.string()).optional(),
  status: Joi.string().valid('active', 'expired', 'disabled').default('active'),
  visibility: Joi.string().valid('public', 'private', 'unlisted').default('public'),
  createdBy: Joi.string().optional(),
  updatedBy: Joi.string().optional()
});

const reviewSchema = Joi.object({
  productId: Joi.string().required(),
  userId: Joi.string().required(),
  companyId: Joi.string().required(),
  rating: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().optional(),
  isApproved: Joi.boolean().default(false),
  flagged: Joi.boolean().default(false),
  helpfulCount: Joi.number().default(0),
  metadata: Joi.object().optional(),
  createdBy: Joi.string().optional(),
  updatedBy: Joi.string().optional(),
  isDeleted: Joi.boolean().default(false),
  deletedAt: Joi.date().optional()
});

const wishlistItemSchema = Joi.object({
  productId: Joi.string().required(),
  addedAt: Joi.date().default(Date.now)
});

const wishlistSchema = Joi.object({
  userId: Joi.string().required(),
  items: Joi.array().items(wishlistItemSchema).default([])
});

const bannerSchema = Joi.object({
  companyId: Joi.string().required(),
  shopId: Joi.string().optional(),
  title: localizedStringSchema.required(),
  subtitle: localizedStringSchema.optional(),
  image: mediaSchema.required(),
  type: Joi.string().valid('homepage', 'seasonal', 'product_highlight').default('homepage'),
  priority: Joi.number().default(0),
  startAt: Joi.date().optional(),
  endAt: Joi.date().optional(),
  ctaAction: Joi.string().valid('product', 'category', 'url', 'none').default('none'),
  ctaPayload: Joi.object().optional(),
  clicks: Joi.number().default(0),
  views: Joi.number().default(0),
  relatedPromotions: Joi.array().items(Joi.string()).optional(),
  relatedProducts: Joi.array().items(Joi.string()).optional(),
  status: Joi.string().valid('active', 'inactive', 'archived').default('active'),
  visibility: Joi.string().valid('public', 'private', 'unlisted').default('public')
});

const deliverySchema = Joi.object({
  orderId: Joi.string().required(),
  companyId: Joi.string().required(),
  shopId: Joi.string().optional(),
  provider: Joi.string().required(),
  trackingNumber: Joi.string().optional(),
  trackingUrl: Joi.string().optional(),
  shippingAddress: addressSchema.required(),
  deliveryMethod: Joi.string().optional(),
  expectedAt: Joi.date().optional(),
  deliveredAt: Joi.date().optional(),
  status: Joi.string().valid('pending', 'in_transit', 'delivered', 'cancelled', 'failed').default('pending'),
  timeline: Joi.array().items(timelineSchema).default([]),
  notes: Joi.string().optional(),
  metadata: Joi.object().optional()
});

const catalogProductSchema = Joi.object({
  productId: Joi.string().required(),
  companyId: Joi.string().required(),
  name: Joi.string().required(),
  slug: Joi.string().required(),
  shortDescription: Joi.string().optional(),
  price: Joi.number().required(),
  currency: Joi.string().default('USD'),
  salePrice: Joi.number().optional(),
  featured: Joi.boolean().default(false),
  images: Joi.array().items(mediaSchema).optional(),
  status: Joi.string().valid('active', 'inactive', 'archived').default('active'),
  visibility: Joi.string().valid('public', 'private', 'unlisted').default('public'),
  categoryId: Joi.string().optional(),
  subcategoryId: Joi.string().optional(),
  subSubcategoryId: Joi.string().optional(),
  stockQty: Joi.number().default(0),
  availability: Joi.string().valid('in_stock', 'out_of_stock', 'low_stock', 'backorder', 'scheduled').default('in_stock'),
  relatedPromotionIds: Joi.array().items(Joi.string()).optional(),
  relatedBannerIds: Joi.array().items(Joi.string()).optional(),
  metadata: Joi.object().optional(),
  createdBy: Joi.string().optional(),
  updatedBy: Joi.string().optional()
});

const Cart = require('../models/Cart.models');
const Catalog = require('../models/Catalog.models');
const Delivery = require('../models/Delivery.models');
const FailedEvent = require('../models/FailedEvent.models');
const FeaturedBanner = require('../models/FeaturedBanner.models');
const Order = require('../models/Order.models');
const Outbox = require('../models/Outbox.models');
const Promotion = require('../models/Promotion.models');
const Review = require('../models/Review.models');
const Wishlist = require('../models/Wishlist.models');

module.exports = {
  // Models
  Cart,
  Catalog,
  Delivery,
  FailedEvent,
  FeaturedBanner,
  Order,
  Outbox,
  Promotion,
  Review,
  Wishlist,

  // Schemas
  cartSchema,
  orderSchema,
  promotionSchema,
  reviewSchema,
  wishlistSchema,
  bannerSchema,
  catalogProductSchema, // Renamed from productSchema
  deliverySchema,
  mediaSchema,
  addressSchema,
  timelineSchema,
  paginationSchema
};