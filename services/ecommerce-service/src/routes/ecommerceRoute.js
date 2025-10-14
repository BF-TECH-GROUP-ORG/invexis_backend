const express = require('express');
const router = express.Router();

// Controllers
const cartController = require('../controllers/cartController');
const catalogController = require('../controllers/catalogController');
const orderController = require('../controllers/orderController');
const promotionController = require('../controllers/promotionController');
const reviewController = require('../controllers/reviewController');
const wishlistController = require('../controllers/wishlistController');

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

module.exports = router;
