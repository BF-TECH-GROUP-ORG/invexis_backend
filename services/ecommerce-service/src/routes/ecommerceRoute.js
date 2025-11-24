const express = require('express');
const router = express.Router();

// Controllers
const cartController = require('../controllers/cartController');
const catalogController = require('../controllers/catalogController');
const orderController = require('../controllers/orderController');
const promotionController = require('../controllers/promotionController');
const reviewController = require('../controllers/reviewController');
const wishlistController = require('../controllers/wishlistController');
const featuredBannerController = require('../controllers/featureBannerController');
// Additional Controllers for merged routes
const recommendationController = require('../controllers/recommendationController');
const searchController = require('../controllers/searchController');
const orderTrackingController = require('../controllers/orderTrackingController');


router.get("/", (req, res) => {
  res.json({ message: "E-commerce Service is running." });
});

// Cart routes
router.get('/cart', cartController.getCart);
router.post('/cart', cartController.addOrUpdateCart); // strict: full cart create/update
router.post('/cart/remove', cartController.removeFromCart);
router.post('/cart/checkout', cartController.checkoutCart);

// Catalog routes
router.get('/products', catalogController.listProducts);
router.get('/products/:id', catalogController.getProduct);
router.post('/products', catalogController.createProduct);
router.put('/products/:id', catalogController.updateProduct);
router.delete('/products/:id', catalogController.deleteProduct);

// Order routes
router.get('/orders', orderController.listOrders);
router.get('/orders/:id', orderController.getOrder);
router.post('/orders', orderController.createOrder);
router.put('/orders/:id', orderController.updateOrder); // strict: full order update

// Promotion routes
router.get('/promotions', promotionController.listPromotions);
router.get('/promotions/:id', promotionController.getPromotion);
router.post('/promotions', promotionController.createPromotion);
router.put('/promotions/:id', promotionController.updatePromotion);
router.delete('/promotions/:id', promotionController.deletePromotion);

// Review routes
router.get('/reviews', reviewController.listReviews);
router.get('/reviews/:id', reviewController.getReview);
router.post('/reviews', reviewController.createReview);
router.patch('/reviews/:id/approve', reviewController.approveReview);
router.delete('/reviews/:id', reviewController.deleteReview);

// Wishlist routes
router.get('/wishlist', wishlistController.getWishlist);
router.post('/wishlist', wishlistController.addOrUpdateWishlist); // strict: full wishlist create/update
router.post('/wishlist/remove', wishlistController.removeFromWishlist);

// Featured Banner routes
router.get('/banners', featuredBannerController.getBanners); // List banners with filters
router.get('/banners/:companyId/:bannerId', featuredBannerController.getBannerById); // Get single banner
router.post('/banners', featuredBannerController.createBanner); // Create new banner
router.put('/banners/:companyId/:bannerId', featuredBannerController.updateBanner); // Update banner
router.delete('/banners/:companyId/:bannerId', featuredBannerController.deleteBanner); // Soft delete banner
router.patch('/banners/:companyId/:bannerId/active', featuredBannerController.toggleActive); // Toggle active status

// Recommendation routes (merged)
router.get('/recommendations', recommendationController.getRecommendations);
router.get('/recommendations/recently-viewed', recommendationController.getRecentlyViewed);

// Search routes (merged)
router.get('/search', searchController.searchProducts);
router.get('/search/filters', searchController.getFilterOptions);
router.get('/search/autocomplete', searchController.autocomplete);

// Order Tracking routes
router.get('/order-tracking/:orderId', orderTrackingController.getTracking);
router.put('/order-tracking/:orderId', orderTrackingController.updateTracking);

module.exports = router;
