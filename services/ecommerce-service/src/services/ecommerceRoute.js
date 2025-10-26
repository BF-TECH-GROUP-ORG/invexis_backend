const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const redis = require('/app/shared/redis.js');
const { publish: publishRabbitMQ, exchanges, subscribe } = require('/app/shared/rabbitmq.js');
const { logger } = require('../utils/logger');

// Imports (Mongoose models, excluding Product)
const Cart = require('../models/Cart.models');
const Order = require('../models/Order.models');
const Promotion = require('../models/Promotion.models');
const Review = require('../models/Review.models');
const Wishlist = require('../models/Wishlist.models');
const Banner = require('../models/Banner.models');

// Imports (Validation schemas)
const {
  cartSchema,
  orderSchema,
  promotionSchema,
  reviewSchema,
  wishlistSchema,
  bannerSchema
} = require('../utils/validation');

// Cache TTLs
const CACHE_TTLS = {
  cart: 300, // 5 minutes
  product: 300, // 5 minutes (for cached inventory responses)
  order: 600, // 10 minutes
  promotion: 3600, // 1 hour
  review: 3600, // 1 hour
  wishlist: 300, // 5 minutes
  banner: 3600, // 1 hour
  rateLimit: 900 // 15 minutes
};

// Caching helpers (excluding product-specific ones)
async function getCachedCart(userId, companyId) {
  const cacheKey = `cart:${companyId}:${userId}`;
  let cartJson = await redis.get(cacheKey);
  if (cartJson) {
    logger.info(`Cache hit for cart: ${cacheKey}`);
    return JSON.parse(cartJson);
  }

  const cart = await Cart.findOne({ userId, companyId }).lean();
  if (!cart) return null;
  await redis.set(cacheKey, JSON.stringify(cart), 'EX', CACHE_TTLS.cart);
  return cart;
}

async function invalidateCartCache(userId, companyId) {
  const cacheKey = `cart:${companyId}:${userId}`;
  await redis.del(cacheKey);
  logger.info(`Invalidated cache for cart: ${cacheKey}`);
}

async function getCachedOrder(orderId, companyId) {
  const cacheKey = `order:${companyId}:${orderId}`;
  let orderJson = await redis.get(cacheKey);
  if (orderJson) {
    logger.info(`Cache hit for order: ${cacheKey}`);
    return JSON.parse(orderJson);
  }

  const order = await Order.findOne({ _id: orderId, companyId }).lean();
  if (!order) return null;
  await redis.set(cacheKey, JSON.stringify(order), 'EX', CACHE_TTLS.order);
  return order;
}

async function invalidateOrderCache(orderId, companyId) {
  const cacheKey = `order:${companyId}:${orderId}`;
  await redis.del(cacheKey);
  logger.info(`Invalidated cache for order: ${cacheKey}`);
}

async function getCachedPromotion(promotionId, companyId) {
  const cacheKey = `promotion:${companyId}:${promotionId}`;
  let promotionJson = await redis.get(cacheKey);
  if (promotionJson) {
    logger.info(`Cache hit for promotion: ${cacheKey}`);
    return JSON.parse(promotionJson);
  }

  const promotion = await Promotion.findOne({ _id: promotionId, companyId }).lean();
  if (!promotion) return null;
  await redis.set(cacheKey, JSON.stringify(promotion), 'EX', CACHE_TTLS.promotion);
  return promotion;
}

async function invalidatePromotionCache(promotionId, companyId) {
  const cacheKey = `promotion:${companyId}:${promotionId}`;
  await redis.del(cacheKey);
  logger.info(`Invalidated cache for promotion: ${cacheKey}`);
}

async function getCachedWishlist(userId, companyId) {
  const cacheKey = `wishlist:${companyId}:${userId}`;
  let wishlistJson = await redis.get(cacheKey);
  if (wishlistJson) {
    logger.info(`Cache hit for wishlist: ${cacheKey}`);
    return JSON.parse(wishlistJson);
  }

  const wishlist = await Wishlist.findOne({ userId, companyId }).lean();
  if (!wishlist) return null;
  await redis.set(cacheKey, JSON.stringify(wishlist), 'EX', CACHE_TTLS.wishlist);
  return wishlist;
}

async function invalidateWishlistCache(userId, companyId) {
  const cacheKey = `wishlist:${companyId}:${userId}`;
  await redis.del(cacheKey);
  logger.info(`Invalidated cache for wishlist: ${cacheKey}`);
}

async function getCachedBanner(bannerId, companyId) {
  const cacheKey = `banner:${companyId}:${bannerId}`;
  let bannerJson = await redis.get(cacheKey);
  if (bannerJson) {
    logger.info(`Cache hit for banner: ${cacheKey}`);
    return JSON.parse(bannerJson);
  }

  const banner = await Banner.findOne({ _id: bannerId, companyId }).lean();
  if (!banner) return null;
  await redis.set(cacheKey, JSON.stringify(banner), 'EX', CACHE_TTLS.banner);
  return banner;
}

async function invalidateBannerCache(bannerId, companyId) {
  const cacheKey = `banner:${companyId}:${bannerId}`;
  await redis.del(cacheKey);
  logger.info(`Invalidated cache for banner: ${cacheKey}`);
}

async function getCachedProductFromInventory(productId, companyId) {
  const cacheKey = `product:${companyId}:${productId}`;
  let productJson = await redis.get(cacheKey);
  if (productJson) {
    logger.info(`Cache hit for product: ${cacheKey}`);
    return JSON.parse(productJson);
  }
  return null;
}

async function invalidateProductCache(productId, companyId) {
  const cacheKey = `product:${companyId}:${productId}`;
  await redis.del(cacheKey);
  logger.info(`Invalidated cache for product: ${cacheKey}`);
}

async function rateLimit(key, max = 10, window = CACHE_TTLS.rateLimit) {
  const countKey = `rate:${key}`;
  let count = await redis.get(countKey);
  count = parseInt(count || 0);
  if (count >= max) return { ok: false, status: 429, message: 'Rate limit exceeded' };
  await redis.set(countKey, (count + 1).toString(), 'EX', window);
  return { ok: true };
}

// Enhanced publishEvent
async function publishEvent(event, data, metadata = {}) {
  const routingKey = `ecommerce.${event}`;
  const payload = { event, data, timestamp: new Date().toISOString(), service: 'ecommerce-service' };
  const traceId = uuidv4();
  const success = await publishRabbitMQ(exchanges.topic, routingKey, payload, { headers: { traceId, ...metadata } });
  if (success) logger.info(`Event emitted: ${event} [trace: ${traceId}]`);
  else logger.warn(`Event queued for retry: ${event}`);
  return traceId;
}

// RPC to Inventory Service
async function requestFromInventory(method, data, companyId, timeout = 5000) {
  const correlationId = uuidv4();
  const queue = 'inventory_rpc_queue';
  const replyQueue = `ecommerce_inventory_reply_${correlationId}`;

  return new Promise((resolve, reject) => {
    let timeoutId;

    // Set up temporary reply queue
    subscribe(
      { queue: replyQueue, exchange: '', pattern: '' },
      async (content) => {
        clearTimeout(timeoutId);
        if (content.error) {
          logger.error(`Inventory service error: ${content.error}`);
          reject(new Error(content.error));
        } else {
          resolve(content.data);
        }
      },
      { exclusive: true }
    ).then(() => {
      // Send request to inventory service
      publishRabbitMQ('', queue, { method, data, replyTo: replyQueue, correlationId });
      logger.info(`Sent inventory request: ${method} [correlationId: ${correlationId}]`);

      // Timeout handling
      timeoutId = setTimeout(() => {
        logger.error(`Inventory request timeout: ${method} [correlationId: ${correlationId}]`);
        reject(new Error('Inventory service timeout'));
      }, timeout);
    }).catch(err => {
      logger.error(`Failed to set up reply queue: ${err.message}`);
      reject(err);
    });
  });
}

// Setup subscribers for external updates (call once on startup)
async function setupSubscribers() {
  // Inventory updates (e.g., product stock changes)
  await subscribe(
    { queue: 'ecommerce_inventory_updates', exchange: exchanges.topic, pattern: 'inventory.product.*' },
    async (content) => {
      const { event, data: { productId, companyId, action } } = content;
      if (!['inventory.product.created', 'inventory.product.updated', 'inventory.product.deleted'].includes(event)) return;
      logger.info(`Received inventory event: ${event} for product ${productId}`);
      await invalidateProductCache(productId, companyId);
      if (event === 'inventory.product.updated' || event === 'inventory.product.deleted') {
        // Invalidate related caches (e.g., carts, wishlists, orders)
        await redis.del(`cart:${companyId}:*`);
        await redis.del(`wishlist:${companyId}:*`);
        await publishEvent('ecommerce.product.updated', { productId, companyId, action });
      }
    }
  );

  // Auth updates (e.g., user tenancy changes)
  await subscribe(
    { queue: 'ecommerce_auth_updates', exchange: exchanges.topic, pattern: 'auth.user.tenancy.*' },
    async (content) => {
      const { event, data: { userId, companyId, action } } = content;
      logger.info(`Received auth event: ${event} for user ${userId}, company ${companyId}`);
      // Example: Update cart or wishlist permissions if needed
      await publishEvent('ecommerce.user.tenancy.updated', { userId, companyId, action });
    }
  );

  logger.info('EcommerceService: Subscribers set up for external updates');
}

// === Core Functions ===

// Cart Functions
async function getCart(userId, companyId) {
  const cart = await getCachedCart(userId, companyId);
  if (!cart) throw new Error('Cart not found');
  return cart;
}

async function addOrUpdateCart(userId, companyId, data) {
  const { error, value } = cartSchema.validate(data);
  if (error) throw new Error(error.details[0].message);

  // Validate product IDs with inventory service
  for (const item of value.items) {
    const product = await requestFromInventory('getProduct', { productId: item.productId, companyId });
    if (!product || product.stock < item.quantity) {
      throw new Error(`Product ${item.productId} not available or insufficient stock`);
    }
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    let cart = await Cart.findOne({ userId, companyId }).session(session);
    if (!cart) {
      cart = new Cart({ userId, companyId, items: value.items });
    } else {
      cart.items = value.items;
    }
    await cart.save({ session });
    await session.commitTransaction();
    await invalidateCartCache(userId, companyId);
    await publishEvent('cart.updated', { userId, companyId, cartId: cart._id });
    return cart;
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error updating cart: %s', error.message);
    throw error;
  } finally {
    session.endSession();
  }
}

async function removeFromCart(userId, companyId, data) {
  const { error, value } = cartSchema.validate(data);
  if (error) throw new Error(error.details[0].message);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const cart = await Cart.findOne({ userId, companyId }).session(session);
    if (!cart) throw new Error('Cart not found');
    cart.items = cart.items.filter(item => !value.items.some(i => i.productId === item.productId));
    await cart.save({ session });
    await session.commitTransaction();
    await invalidateCartCache(userId, companyId);
    await publishEvent('cart.updated', { userId, companyId, cartId: cart._id });
    return cart;
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error removing from cart: %s', error.message);
    throw error;
  } finally {
    session.endSession();
  }
}

async function checkoutCart(userId, companyId) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const cart = await Cart.findOne({ userId, companyId }).session(session);
    if (!cart || !cart.items.length) throw new Error('Cart is empty or not found');

    // Validate product availability with inventory service
    for (const item of cart.items) {
      const product = await requestFromInventory('getProduct', { productId: item.productId, companyId });
      if (!product || product.stock < item.quantity) {
        throw new Error(`Product ${item.productId} not available or insufficient stock`);
      }
    }

    // Create order from cart
    const order = new Order({
      userId,
      companyId,
      items: cart.items,
      status: 'pending',
      total: cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    });
    await order.save({ session });

    // Notify inventory service to update stock
    for (const item of cart.items) {
      await requestFromInventory('updateProductStock', {
        productId: item.productId,
        companyId,
        quantity: -item.quantity
      });
    }

    // Clear cart
    await Cart.deleteOne({ userId, companyId }, { session });

    await session.commitTransaction();
    await invalidateCartCache(userId, companyId);
    await invalidateOrderCache(order._id, companyId);
    await publishEvent('order.created', { userId, companyId, orderId: order._id });
    return order;
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error checking out cart: %s', error.message);
    throw error;
  } finally {
    session.endSession();
  }
}

// Catalog Functions
async function listProducts(companyId, query = {}) {
  const { page = 1, limit = 20, category, keyword, sortBy = 'createdAt', sortOrder = 'desc' } = query;
  const cacheKey = `products:${companyId}:${category || 'all'}:${keyword || 'none'}:${page}:${limit}:${sortBy}:${sortOrder}`;
  let productsJson = await redis.get(cacheKey);
  if (productsJson) {
    logger.info(`Cache hit for products: ${cacheKey}`);
    return JSON.parse(productsJson);
  }

  const filter = { companyId };
  if (category) filter.category = category;
  if (keyword) filter.keyword = keyword;
  const data = {
    page: parseInt(page),
    limit: parseInt(limit),
    sortBy,
    sortOrder,
    filter
  };

  const result = await requestFromInventory('listProducts', data);
  await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTLS.product);
  return result;
}

async function getProduct(productId, companyId) {
  let product = await getCachedProductFromInventory(productId, companyId);
  if (!product) {
    product = await requestFromInventory('getProduct', { productId, companyId });
    if (!product) throw new Error('Product not found');
    await redis.set(`product:${companyId}:${productId}`, JSON.stringify(product), 'EX', CACHE_TTLS.product);
  }
  return product;
}

async function createProduct(companyId, data) {
  const { error, value } = productSchema.validate(data);
  if (error) throw new Error(error.details[0].message);

  const product = await requestFromInventory('createProduct', { ...value, companyId });
  await publishEvent('product.created', { productId: product._id, companyId });
  return product;
}

async function updateProduct(productId, companyId, data) {
  const { error, value } = productSchema.validate(data);
  if (error) throw new Error(error.details[0].message);

  const product = await requestFromInventory('updateProduct', { productId, companyId, ...value });
  if (!product) throw new Error('Product not found');
  await invalidateProductCache(productId, companyId);
  await publishEvent('product.updated', { productId, companyId });
  return product;
}

async function deleteProduct(productId, companyId) {
  const result = await requestFromInventory('deleteProduct', { productId, companyId });
  if (!result.success) throw new Error('Product not found');
  await invalidateProductCache(productId, companyId);
  await publishEvent('product.deleted', { productId, companyId });
  return { message: 'Product deleted' };
}

// Order Functions
async function listOrders(userId, companyId, query = {}) {
  const { page = 1, limit = 10, status } = query;
  const cacheKey = `orders:${companyId}:${userId}:${status || 'all'}:${page}:${limit}`;
  let ordersJson = await redis.get(cacheKey);
  if (ordersJson) {
    logger.info(`Cache hit for orders: ${cacheKey}`);
    return JSON.parse(ordersJson);
  }

  const filter = { userId, companyId };
  if (status) filter.status = status;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
    Order.countDocuments(filter)
  ]);

  const result = { orders, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) } };
  await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTLS.order);
  return result;
}

async function getOrder(orderId, companyId) {
  const order = await getCachedOrder(orderId, companyId);
  if (!order) throw new Error('Order not found');
  return order;
}

async function createOrder(userId, companyId, data) {
  const { error, value } = orderSchema.validate(data);
  if (error) throw new Error(error.details[0].message);

  // Validate product availability
  for (const item of value.items) {
    const product = await requestFromInventory('getProduct', { productId: item.productId, companyId });
    if (!product || product.stock < item.quantity) {
      throw new Error(`Product ${item.productId} not available or insufficient stock`);
    }
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const order = new Order({ ...value, userId, companyId });
    await order.save({ session });

    // Update inventory stock
    for (const item of value.items) {
      await requestFromInventory('updateProductStock', {
        productId: item.productId,
        companyId,
        quantity: -item.quantity
      });
    }

    await session.commitTransaction();
    await invalidateOrderCache(order._id, companyId);
    await publishEvent('order.created', { orderId: order._id, userId, companyId });
    return order;
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error creating order: %s', error.message);
    throw error;
  } finally {
    session.endSession();
  }
}

async function updateOrder(orderId, companyId, data) {
  const { error, value } = orderSchema.validate(data);
  if (error) throw new Error(error.details[0].message);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const order = await Order.findOneAndUpdate(
      { _id: orderId, companyId },
      value,
      { new: true, runValidators: true, session }
    );
    if (!order) throw new Error('Order not found');
    await session.commitTransaction();
    await invalidateOrderCache(orderId, companyId);
    await publishEvent('order.updated', { orderId, companyId });
    return order;
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error updating order: %s', error.message);
    throw error;
  } finally {
    session.endSession();
  }
}

// Promotion Functions
async function listPromotions(companyId, query = {}) {
  const { page = 1, limit = 20, active } = query;
  const cacheKey = `promotions:${companyId}:${active ? 'active' : 'all'}:${page}:${limit}`;
  let promotionsJson = await redis.get(cacheKey);
  if (promotionsJson) {
    logger.info(`Cache hit for promotions: ${cacheKey}`);
    return JSON.parse(promotionsJson);
  }

  const filter = { companyId };
  if (active !== undefined) filter.isActive = active;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [promotions, total] = await Promise.all([
    Promotion.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
    Promotion.countDocuments(filter)
  ]);

  const result = { promotions, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) } };
  await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTLS.promotion);
  return result;
}

async function getPromotion(promotionId, companyId) {
  const promotion = await getCachedPromotion(promotionId, companyId);
  if (!promotion) throw new Error('Promotion not found');
  return promotion;
}

async function createPromotion(companyId, data) {
  const { error, value } = promotionSchema.validate(data);
  if (error) throw new Error(error.details[0].message);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const promotion = new Promotion({ ...value, companyId });
    await promotion.save({ session });
    await session.commitTransaction();
    await invalidatePromotionCache(promotion._id, companyId);
    await publishEvent('promotion.created', { promotionId: promotion._id, companyId });
    return promotion;
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error creating promotion: %s', error.message);
    throw error;
  } finally {
    session.endSession();
  }
}

async function updatePromotion(promotionId, companyId, data) {
  const { error, value } = promotionSchema.validate(data);
  if (error) throw new Error(error.details[0].message);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const promotion = await Promotion.findOneAndUpdate(
      { _id: promotionId, companyId },
      value,
      { new: true, runValidators: true, session }
    );
    if (!promotion) throw new Error('Promotion not found');
    await session.commitTransaction();
    await invalidatePromotionCache(promotionId, companyId);
    await publishEvent('promotion.updated', { promotionId, companyId });
    return promotion;
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error updating promotion: %s', error.message);
    throw error;
  } finally {
    session.endSession();
  }
}

async function deletePromotion(promotionId, companyId) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const promotion = await Promotion.findOneAndDelete({ _id: promotionId, companyId }, { session });
    if (!promotion) throw new Error('Promotion not found');
    await session.commitTransaction();
    await invalidatePromotionCache(promotionId, companyId);
    await publishEvent('promotion.deleted', { promotionId, companyId });
    return { message: 'Promotion deleted' };
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error deleting promotion: %s', error.message);
    throw error;
  } finally {
    session.endSession();
  }
}

// Review Functions
async function listReviews(companyId, query = {}) {
  const { page = 1, limit = 20, productId, approved } = query;
  const cacheKey = `reviews:${companyId}:${productId || 'all'}:${approved ? 'approved' : 'all'}:${page}:${limit}`;
  let reviewsJson = await redis.get(cacheKey);
  if (reviewsJson) {
    logger.info(`Cache hit for reviews: ${cacheKey}`);
    return JSON.parse(reviewsJson);
  }

  const filter = { companyId };
  if (productId) filter.productId = productId;
  if (approved !== undefined) filter.approved = approved;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [reviews, total] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
    Review.countDocuments(filter)
  ]);

  const result = { reviews, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) } };
  await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTLS.review);
  return result;
}

async function getReview(reviewId, companyId) {
  const review = await Review.findOne({ _id: reviewId, companyId }).lean();
  if (!review) throw new Error('Review not found');
  return review;
}

async function createReview(userId, companyId, data) {
  const { error, value } = reviewSchema.validate(data);
  if (error) throw new Error(error.details[0].message);

  // Validate product exists
  const product = await requestFromInventory('getProduct', { productId: value.productId, companyId });
  if (!product) throw new Error('Product not found');

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const review = new Review({ ...value, userId, companyId });
    await review.save({ session });
    await session.commitTransaction();
    await redis.del(`reviews:${companyId}:*`);
    await publishEvent('review.created', { reviewId: review._id, userId, companyId });
    return review;
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error creating review: %s', error.message);
    throw error;
  } finally {
    session.endSession();
  }
}

async function approveReview(reviewId, companyId) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const review = await Review.findOneAndUpdate(
      { _id: reviewId, companyId },
      { approved: true },
      { new: true, session }
    );
    if (!review) throw new Error('Review not found');
    await session.commitTransaction();
    await redis.del(`reviews:${companyId}:*`);
    await publishEvent('review.approved', { reviewId, companyId });
    return review;
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error approving review: %s', error.message);
    throw error;
  } finally {
    session.endSession();
  }
}

async function deleteReview(reviewId, companyId) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const review = await Review.findOneAndDelete({ _id: reviewId, companyId }, { session });
    if (!review) throw new Error('Review not found');
    await session.commitTransaction();
    await redis.del(`reviews:${companyId}:*`);
    await publishEvent('review.deleted', { reviewId, companyId });
    return { message: 'Review deleted' };
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error deleting review: %s', error.message);
    throw error;
  } finally {
    session.endSession();
  }
}

// Wishlist Functions
async function getWishlist(userId, companyId) {
  const wishlist = await getCachedWishlist(userId, companyId);
  if (!wishlist) throw new Error('Wishlist not found');
  return wishlist;
}

async function addOrUpdateWishlist(userId, companyId, data) {
  const { error, value } = wishlistSchema.validate(data);
  if (error) throw new Error(error.details[0].message);

  // Validate product IDs
  for (const item of value.items) {
    const product = await requestFromInventory('getProduct', { productId: item.productId, companyId });
    if (!product) throw new Error(`Product ${item.productId} not found`);
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    let wishlist = await Wishlist.findOne({ userId, companyId }).session(session);
    if (!wishlist) {
      wishlist = new Wishlist({ userId, companyId, items: value.items });
    } else {
      wishlist.items = value.items;
    }
    await wishlist.save({ session });
    await session.commitTransaction();
    await invalidateWishlistCache(userId, companyId);
    await publishEvent('wishlist.updated', { userId, companyId, wishlistId: wishlist._id });
    return wishlist;
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error updating wishlist: %s', error.message);
    throw error;
  } finally {
    session.endSession();
  }
}

async function removeFromWishlist(userId, companyId, data) {
  const { error, value } = wishlistSchema.validate(data);
  if (error) throw new Error(error.details[0].message);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const wishlist = await Wishlist.findOne({ userId, companyId }).session(session);
    if (!wishlist) throw new Error('Wishlist not found');
    wishlist.items = wishlist.items.filter(item => !value.items.some(i => i.productId === item.productId));
    await wishlist.save({ session });
    await session.commitTransaction();
    await invalidateWishlistCache(userId, companyId);
    await publishEvent('wishlist.updated', { userId, companyId, wishlistId: wishlist._id });
    return wishlist;
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error removing from wishlist: %s', error.message);
    throw error;
  } finally {
    session.endSession();
  }
}

// Featured Banner Functions
async function getBanners(companyId, query = {}) {
  const { page = 1, limit = 20, active } = query;
  const cacheKey = `banners:${companyId}:${active ? 'active' : 'all'}:${page}:${limit}`;
  let bannersJson = await redis.get(cacheKey);
  if (bannersJson) {
    logger.info(`Cache hit for banners: ${cacheKey}`);
    return JSON.parse(bannersJson);
  }

  const filter = { companyId };
  if (active !== undefined) filter.isActive = active;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [banners, total] = await Promise.all([
    Banner.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
    Banner.countDocuments(filter)
  ]);

  const result = { banners, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) } };
  await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTLS.banner);
  return result;
}

async function getBannerById(bannerId, companyId) {
  const banner = await getCachedBanner(bannerId, companyId);
  if (!banner) throw new Error('Banner not found');
  return banner;
}

async function createBanner(companyId, data) {
  const { error, value } = bannerSchema.validate(data);
  if (error) throw new Error(error.details[0].message);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const banner = new Banner({ ...value, companyId });
    await banner.save({ session });
    await session.commitTransaction();
    await invalidateBannerCache(banner._id, companyId);
    await redis.del(`banners:${companyId}:*`);
    await publishEvent('banner.created', { bannerId: banner._id, companyId });
    return banner;
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error creating banner: %s', error.message);
    throw error;
  } finally {
    session.endSession();
  }
}

async function updateBanner(bannerId, companyId, data) {
  const { error, value } = bannerSchema.validate(data);
  if (error) throw new Error(error.details[0].message);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const banner = await Banner.findOneAndUpdate(
      { _id: bannerId, companyId },
      value,
      { new: true, runValidators: true, session }
    );
    if (!banner) throw new Error('Banner not found');
    await session.commitTransaction();
    await invalidateBannerCache(bannerId, companyId);
    await redis.del(`banners:${companyId}:*`);
    await publishEvent('banner.updated', { bannerId, companyId });
    return banner;
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error updating banner: %s', error.message);
    throw error;
  } finally {
    session.endSession();
  }
}

async function deleteBanner(bannerId, companyId) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const banner = await Banner.findOneAndUpdate(
      { _id: bannerId, companyId },
      { isDeleted: true, deletedAt: new Date() },
      { session }
    );
    if (!banner) throw new Error('Banner not found');
    await session.commitTransaction();
    await invalidateBannerCache(bannerId, companyId);
    await redis.del(`banners:${companyId}:*`);
    await publishEvent('banner.deleted', { bannerId, companyId });
    return { message: 'Banner deleted' };
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error deleting banner: %s', error.message);
    throw error;
  } finally {
    session.endSession();
  }
}

async function toggleBannerActive(bannerId, companyId) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const banner = await Banner.findOne({ _id: bannerId, companyId }).session(session);
    if (!banner) throw new Error('Banner not found');
    banner.isActive = !banner.isActive;
    await banner.save({ session });
    await session.commitTransaction();
    await invalidateBannerCache(bannerId, companyId);
    await redis.del(`banners:${companyId}:*`);
    await publishEvent('banner.toggled', { bannerId, companyId, isActive: banner.isActive });
    return banner;
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error toggling banner active status: %s', error.message);
    throw error;
  } finally {
    session.endSession();
  }
}

module.exports = {
  setupSubscribers,
  // Cart
  getCart,
  addOrUpdateCart,
  removeFromCart,
  checkoutCart,
  // Catalog
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  // Order
  listOrders,
  getOrder,
  createOrder,
  updateOrder,
  // Promotion
  listPromotions,
  getPromotion,
  createPromotion,
  updatePromotion,
  deletePromotion,
  // Review
  listReviews,
  getReview,
  createReview,
  approveReview,
  deleteReview,
  // Wishlist
  getWishlist,
  addOrUpdateWishlist,
  removeFromWishlist,
  // Featured Banner
  getBanners,
  getBannerById,
  createBanner,
  updateBanner,
  deleteBanner,
  toggleBannerActive
};