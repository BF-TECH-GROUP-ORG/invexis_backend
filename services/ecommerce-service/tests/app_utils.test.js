const app = require('../src/utils/app');
const mongoose = require('mongoose');

describe('App Utils', () => {
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
        expect(app.paginationSchema).toBeDefined();

        // Verify they are Joi schemas
        expect(app.cartSchema.describe).toBeDefined();
    });
});
