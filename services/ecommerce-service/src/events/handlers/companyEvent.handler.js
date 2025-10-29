/**
 * Company Event Handler
 * Handles company-related events from company-service
 * Manages company-level ecommerce cleanup
 */

const Cart = require('../../models/Cart');
const Order = require('../../models/Order');
const Review = require('../../models/Review');
const Promotion = require('../../models/Promotion');
const Wishlist = require('../../models/Wishlist');
const Banner = require('../../models/Banner');
const redis = require('/app/shared/redis.js');
const { logger } = require('../../utils/app');

/**
 * Handle company deleted event - Cleanup all ecommerce data
 */
async function handleCompanyDeleted(data) {
  try {
    const { companyId } = data;

    logger.info(`🏢 Processing company deleted: ${companyId}`);

    // Delete all ecommerce data for this company
    const deletionResults = {
      carts: 0,
      orders: 0,
      reviews: 0,
      promotions: 0,
      wishlists: 0,
      banners: 0
    };

    // Delete carts
    const cartsResult = await Cart.deleteMany({ companyId });
    deletionResults.carts = cartsResult.deletedCount;

    // Delete orders
    const ordersResult = await Order.deleteMany({ companyId });
    deletionResults.orders = ordersResult.deletedCount;

    // Delete reviews
    const reviewsResult = await Review.deleteMany({ companyId });
    deletionResults.reviews = reviewsResult.deletedCount;

    // Delete promotions
    const promotionsResult = await Promotion.deleteMany({ companyId });
    deletionResults.promotions = promotionsResult.deletedCount;

    // Delete wishlists
    const wishlistsResult = await Wishlist.deleteMany({ companyId });
    deletionResults.wishlists = wishlistsResult.deletedCount;

    // Delete banners
    const bannersResult = await Banner.deleteMany({ companyId });
    deletionResults.banners = bannersResult.deletedCount;

    // Clear all company caches
    const keys = await redis.keys(`*:${companyId}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    logger.info(
      `✅ Company ${companyId} ecommerce data deleted:`,
      deletionResults
    );
  } catch (error) {
    logger.error(`❌ Error handling company deleted: ${error.message}`);
    throw error;
  }
}

/**
 * Main handler function
 */
module.exports = async function handleCompanyEvent(event) {
  try {
    const { type, data } = event;

    logger.info(`🏢 Processing company event: ${type}`);

    switch (type) {
      case 'company.deleted':
        await handleCompanyDeleted(data);
        break;

      default:
        logger.warn(`⚠️ Unhandled company event type: ${type}`);
    }
  } catch (error) {
    logger.error(`❌ Error handling company event: ${error.message}`);
    throw error;
  }
};

