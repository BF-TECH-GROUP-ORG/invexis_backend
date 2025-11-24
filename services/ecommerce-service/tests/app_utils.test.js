const app = require('../src/utils/app');
const mongoose = require('mongoose');

describe('App Utils', () => {
    test('should export all Mongoose models', () => {
        expect(app.Cart).toBeDefined();
        expect(app.Catalog).toBeDefined();
        expect(app.Delivery).toBeDefined();
        expect(app.FailedEvent).toBeDefined();
        expect(app.FeaturedBanner).toBeDefined();
        expect(app.Order).toBeDefined();
        expect(app.Outbox).toBeDefined();
        expect(app.Promotion).toBeDefined();
        expect(app.Review).toBeDefined();
        expect(app.Wishlist).toBeDefined();

        // Verify they are Mongoose models
        expect(app.Cart.prototype).toBeInstanceOf(mongoose.Model);
    });

    test('should export all Joi schemas', () => {
        expect(app.cartSchema).toBeDefined();
        expect(app.orderSchema).toBeDefined();
        expect(app.promotionSchema).toBeDefined();
        expect(app.reviewSchema).toBeDefined();
        expect(app.wishlistSchema).toBeDefined();
        expect(app.bannerSchema).toBeDefined();
        expect(app.catalogProductSchema).toBeDefined();
        expect(app.deliverySchema).toBeDefined();
        expect(app.mediaSchema).toBeDefined();
        expect(app.addressSchema).toBeDefined();
        expect(app.timelineSchema).toBeDefined();
    });
});
