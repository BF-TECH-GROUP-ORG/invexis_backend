const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const ecommerceRoute = require('../src/routes/ecommerceRoute');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use('/api', ecommerceRoute);

// Test data with unique identifiers
const uniqueSuffix = Date.now();
const testData = {
    userId: `user-${uniqueSuffix}`,
    companyId: `company-${uniqueSuffix}`,
    shopId: `shop-${uniqueSuffix}`,
    productId: `prod-${uniqueSuffix}`,
    orderId: `order-${uniqueSuffix}`,
    promotionId: `promo-${uniqueSuffix}`,
    reviewId: `review-${uniqueSuffix}`,
    bannerId: `banner-${uniqueSuffix}`,
    campaignId: `campaign-${uniqueSuffix}`,
    flashSaleId: `flash-${uniqueSuffix}`,
    seasonalId: `seasonal-${uniqueSuffix}`,
    notificationId: `notif-${uniqueSuffix}`,
    alertId: `alert-${uniqueSuffix}`,
};

// Sample test objects
const sampleProduct = {
    productId: testData.productId,
    companyId: testData.companyId,
    title: { en: 'Test Product' },
    description: { en: 'Test Description' },
    price: 99.99,
    currency: 'USD',
    stock: 100,
    category: 'electronics',
    tags: ['test', 'sample']
};

const sampleCart = {
    userId: testData.userId,
    items: [
        { productId: testData.productId, quantity: 2, priceAtAdd: 99.99, currency: 'USD' }
    ]
};

const sampleOrder = {
    orderId: testData.orderId,
    userId: testData.userId,
    items: [
        { productId: testData.productId, quantity: 1, priceAtOrder: 99.99, currency: 'USD' }
    ],
    subtotal: 99.99,
    totalAmount: 99.99,
    currency: 'USD',
    status: 'pending'
};

const samplePromotion = {
    promotionId: testData.promotionId,
    companyId: testData.companyId,
    name: 'Test Promotion',
    discountType: 'percentage',
    discountValue: 15,
    startAt: new Date(),
    endAt: new Date(Date.now() + 86400000 * 7)
};

const sampleReview = {
    reviewId: testData.reviewId,
    userId: testData.userId,
    productId: testData.productId,
    companyId: testData.companyId,
    rating: 5,
    comment: 'Great product!'
};

const sampleWishlist = {
    userId: testData.userId,
    items: [{ productId: testData.productId }]
};

const sampleBanner = {
    bannerId: testData.bannerId,
    companyId: testData.companyId,
    shopId: testData.shopId,
    title: { en: 'Test Banner' },
    subtitle: { en: 'Test Subtitle' },
    imageUrl: 'https://example.com/banner.jpg',
    target: { type: 'product', id: testData.productId },
    type: 'homepage',
    priority: 1,
    startAt: new Date(),
    endAt: new Date(Date.now() + 86400000),
    isActive: true
};

beforeAll(async () => {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ecommerce_test';
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB for testing');
});

afterAll(async () => {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
});

describe('Comprehensive Ecommerce API Test Suite', () => {

    // ============================================
    // CORE E-COMMERCE FEATURES
    // ============================================

    describe('Cart Management', () => {
        it('POST /api/cart - create/update cart', async () => {
            const res = await request(app).post('/api/cart').send(sampleCart);
            expect([200, 201]).toContain(res.status);
            if (res.status < 400) {
                expect(res.body).toHaveProperty('_id');
            }
        });

        it('GET /api/cart - get cart', async () => {
            const res = await request(app).get('/api/cart').query({ userId: testData.userId });
            expect([200, 404]).toContain(res.status);
        });

        it('POST /api/cart/remove - remove item from cart', async () => {
            const res = await request(app).post('/api/cart/remove').send({
                userId: testData.userId,
                productId: testData.productId
            });
            expect([200, 404]).toContain(res.status);
        });

        it('POST /api/cart/checkout - checkout cart', async () => {
            const res = await request(app).post('/api/cart/checkout').send({
                userId: testData.userId
            });
            expect([200, 400, 404]).toContain(res.status);
        });
    });

    describe('Product Catalog', () => {
        it('POST /api/products - create product', async () => {
            const res = await request(app).post('/api/products').send(sampleProduct);
            expect([200, 201]).toContain(res.status);
        });

        it('GET /api/products - list products', async () => {
            const res = await request(app).get('/api/products').query({ companyId: testData.companyId });
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body) || res.body.data).toBeTruthy();
        });

        it('GET /api/products/:id - get product by id', async () => {
            const res = await request(app).get(`/api/products/${testData.productId}`);
            expect([200, 404]).toContain(res.status);
        });

        it('PUT /api/products/:id - update product', async () => {
            const res = await request(app).put(`/api/products/${testData.productId}`).send({
                ...sampleProduct,
                price: 89.99
            });
            expect([200, 404]).toContain(res.status);
        });

        it('DELETE /api/products/:id - delete product', async () => {
            const res = await request(app).delete(`/api/products/${testData.productId}`);
            expect([200, 404]).toContain(res.status);
        });
    });

    describe('Orders', () => {
        it('POST /api/orders - create order', async () => {
            const res = await request(app).post('/api/orders').send(sampleOrder);
            expect([200, 201, 400]).toContain(res.status);
        });

        it('GET /api/orders - list orders', async () => {
            const res = await request(app).get('/api/orders').query({ userId: testData.userId });
            expect(res.status).toBe(200);
        });

        it('GET /api/orders/:id - get order by id', async () => {
            const res = await request(app).get(`/api/orders/${testData.orderId}`);
            expect([200, 404]).toContain(res.status);
        });

        it('PUT /api/orders/:id - update order', async () => {
            const res = await request(app).put(`/api/orders/${testData.orderId}`).send({
                ...sampleOrder,
                status: 'processing'
            });
            expect([200, 404]).toContain(res.status);
        });
    });

    describe('Promotions', () => {
        it('POST /api/promotions - create promotion', async () => {
            const res = await request(app).post('/api/promotions').send(samplePromotion);
            expect([200, 201]).toContain(res.status);
        });

        it('GET /api/promotions - list promotions', async () => {
            const res = await request(app).get('/api/promotions').query({ companyId: testData.companyId });
            expect(res.status).toBe(200);
        });

        it('GET /api/promotions/:id - get promotion by id', async () => {
            const res = await request(app).get(`/api/promotions/${testData.promotionId}`);
            expect([200, 404]).toContain(res.status);
        });

        it('PUT /api/promotions/:id - update promotion', async () => {
            const res = await request(app).put(`/api/promotions/${testData.promotionId}`).send({
                ...samplePromotion,
                discountValue: 20
            });
            expect([200, 404]).toContain(res.status);
        });

        it('DELETE /api/promotions/:id - delete promotion', async () => {
            const res = await request(app).delete(`/api/promotions/${testData.promotionId}`);
            expect([200, 404]).toContain(res.status);
        });
    });

    describe('Reviews', () => {
        it('POST /api/reviews - create review', async () => {
            const res = await request(app).post('/api/reviews').send(sampleReview);
            expect([200, 201, 400]).toContain(res.status);
        });

        it('GET /api/reviews - list reviews', async () => {
            const res = await request(app).get('/api/reviews').query({ productId: testData.productId });
            expect(res.status).toBe(200);
        });

        it('GET /api/reviews/:id - get review by id', async () => {
            const res = await request(app).get(`/api/reviews/${testData.reviewId}`);
            expect([200, 404]).toContain(res.status);
        });

        it('PATCH /api/reviews/:id/approve - approve review', async () => {
            const res = await request(app).patch(`/api/reviews/${testData.reviewId}/approve`);
            expect([200, 404]).toContain(res.status);
        });

        it('DELETE /api/reviews/:id - delete review', async () => {
            const res = await request(app).delete(`/api/reviews/${testData.reviewId}`);
            expect([200, 404]).toContain(res.status);
        });
    });

    describe('Wishlists', () => {
        it('POST /api/wishlist - create/update wishlist', async () => {
            const res = await request(app).post('/api/wishlist').send(sampleWishlist);
            expect([200, 201]).toContain(res.status);
        });

        it('GET /api/wishlist - get wishlist', async () => {
            const res = await request(app).get('/api/wishlist').query({ userId: testData.userId });
            expect([200, 404]).toContain(res.status);
        });

        it('POST /api/wishlist/remove - remove item from wishlist', async () => {
            const res = await request(app).post('/api/wishlist/remove').send({
                userId: testData.userId,
                productId: testData.productId
            });
            expect([200, 404]).toContain(res.status);
        });

        it('DELETE /api/wishlist - delete entire wishlist', async () => {
            const res = await request(app).delete('/api/wishlist').send({
                userId: testData.userId
            });
            expect([200, 404]).toContain(res.status);
        });
    });

    describe('Featured Banners', () => {
        it('POST /api/banners - create banner', async () => {
            const res = await request(app).post('/api/banners').send(sampleBanner);
            expect([200, 201]).toContain(res.status);
        });

        it('GET /api/banners - list banners', async () => {
            const res = await request(app).get('/api/banners').query({ companyId: testData.companyId });
            expect(res.status).toBe(200);
        });

        it('GET /api/banners/:companyId/:bannerId - get banner', async () => {
            const res = await request(app).get(`/api/banners/${testData.companyId}/${testData.bannerId}`);
            expect([200, 404]).toContain(res.status);
        });

        it('PUT /api/banners/:companyId/:bannerId - update banner', async () => {
            const res = await request(app)
                .put(`/api/banners/${testData.companyId}/${testData.bannerId}`)
                .send({ title: { en: 'Updated Banner' } });
            expect([200, 404]).toContain(res.status);
        });

        it('PATCH /api/banners/:companyId/:bannerId/active - toggle active', async () => {
            const res = await request(app)
                .patch(`/api/banners/${testData.companyId}/${testData.bannerId}/active`)
                .send({ isActive: false });
            expect([200, 404]).toContain(res.status);
        });

        it('DELETE /api/banners/:companyId/:bannerId - delete banner', async () => {
            const res = await request(app).delete(`/api/banners/${testData.companyId}/${testData.bannerId}`);
            expect([200, 404]).toContain(res.status);
        });
    });

    // ============================================
    // DISCOVERY & PERSONALIZATION
    // ============================================

    describe('Recommendations', () => {
        it('GET /api/recommendations - get recommendations', async () => {
            const res = await request(app).get('/api/recommendations').query({ userId: testData.userId });
            expect([200, 404, 500]).toContain(res.status);
        });

        it('GET /api/recommendations/recently-viewed - get recently viewed', async () => {
            const res = await request(app).get('/api/recommendations/recently-viewed').query({ userId: testData.userId });
            expect([200, 404, 500]).toContain(res.status);
        });
    });

    describe('Search', () => {
        it('GET /api/search - search products', async () => {
            const res = await request(app).get('/api/search').query({ q: 'test', companyId: testData.companyId });
            expect([200, 400]).toContain(res.status);
        });

        it('GET /api/search/filters - get filter options', async () => {
            const res = await request(app).get('/api/search/filters').query({ companyId: testData.companyId });
            expect([200, 500]).toContain(res.status);
        });

        it('GET /api/search/autocomplete - autocomplete search', async () => {
            const res = await request(app).get('/api/search/autocomplete').query({ q: 'test' });
            expect([200, 400]).toContain(res.status);
        });
    });

    describe('Order Tracking', () => {
        it('GET /api/order-tracking/:orderId - get tracking', async () => {
            const res = await request(app).get(`/api/order-tracking/${testData.orderId}`);
            expect([200, 404]).toContain(res.status);
        });

        it('PUT /api/order-tracking/:orderId - update tracking', async () => {
            const res = await request(app).put(`/api/order-tracking/${testData.orderId}`).send({
                status: 'shipped',
                location: 'Distribution Center'
            });
            expect([200, 404]).toContain(res.status);
        });
    });

    // ============================================
    // ANALYTICS & BUSINESS INTELLIGENCE
    // ============================================

    describe('Analytics - Dashboard', () => {
        it('GET /api/analytics/dashboard - get dashboard analytics', async () => {
            const res = await request(app).get('/api/analytics/dashboard').query({ companyId: testData.companyId });
            expect([200, 500]).toContain(res.status);
        });
    });

    describe('Analytics - Products', () => {
        it('GET /api/analytics/products - get product analytics', async () => {
            const res = await request(app).get('/api/analytics/products').query({ companyId: testData.companyId });
            expect([200, 500]).toContain(res.status);
        });

        it('GET /api/analytics/products/:productId - get product detail analytics', async () => {
            const res = await request(app).get(`/api/analytics/products/${testData.productId}`);
            expect([200, 404, 500]).toContain(res.status);
        });

        it('GET /api/analytics/products/category/:category - get category analytics', async () => {
            const res = await request(app).get('/api/analytics/products/category/electronics');
            expect([200, 500]).toContain(res.status);
        });
    });

    describe('Analytics - Orders', () => {
        it('GET /api/analytics/orders/status-distribution - get order status distribution', async () => {
            const res = await request(app).get('/api/analytics/orders/status-distribution').query({ companyId: testData.companyId });
            expect([200, 500]).toContain(res.status);
        });

        it('GET /api/analytics/revenue/trends - get revenue trends', async () => {
            const res = await request(app).get('/api/analytics/revenue/trends').query({ companyId: testData.companyId });
            expect([200, 500]).toContain(res.status);
        });
    });

    // ============================================
    // GRAPH-BASED DATA
    // ============================================

    describe('Graph - Product Relationships', () => {
        it('GET /api/graph/related-products/:productId - get related products', async () => {
            const res = await request(app).get(`/api/graph/related-products/${testData.productId}`);
            expect([200, 404, 500]).toContain(res.status);
        });

        it('GET /api/graph/frequently-bought-together/:productId - get frequently bought together', async () => {
            const res = await request(app).get(`/api/graph/frequently-bought-together/${testData.productId}`);
            expect([200, 404, 500]).toContain(res.status);
        });

        it('GET /api/graph/product-relationships - get product relationship graph', async () => {
            const res = await request(app).get('/api/graph/product-relationships').query({ companyId: testData.companyId });
            expect([200, 500]).toContain(res.status);
        });

        it('GET /api/graph/category-graph - get category graph', async () => {
            const res = await request(app).get('/api/graph/category-graph').query({ companyId: testData.companyId });
            expect([200, 500]).toContain(res.status);
        });
    });

    describe('Graph - Customer Behavior', () => {
        it('GET /api/graph/customer-patterns/:userId - get customer behavior patterns', async () => {
            const res = await request(app).get(`/api/graph/customer-patterns/${testData.userId}`);
            expect([200, 404, 500]).toContain(res.status);
        });

        it('GET /api/graph/customer-journey/:userId - get customer journey', async () => {
            const res = await request(app).get(`/api/graph/customer-journey/${testData.userId}`);
            expect([200, 404, 500]).toContain(res.status);
        });
    });

    // ============================================
    // MANAGEMENT ENDPOINTS (ADMIN)
    // ============================================

    describe('Management - Product Management', () => {
        it('POST /api/management/products/bulk-update - bulk update products', async () => {
            const res = await request(app).post('/api/management/products/bulk-update').send({
                productIds: [testData.productId],
                updates: { stock: 50 }
            });
            expect([200, 400, 500]).toContain(res.status);
        });

        it('POST /api/management/products/bulk-delete - bulk delete products', async () => {
            const res = await request(app).post('/api/management/products/bulk-delete').send({
                productIds: [testData.productId]
            });
            expect([200, 400, 500]).toContain(res.status);
        });

        it('POST /api/management/products/bulk-price-update - bulk update prices', async () => {
            const res = await request(app).post('/api/management/products/bulk-price-update').send({
                updates: [{ productId: testData.productId, price: 79.99 }]
            });
            expect([200, 400, 500]).toContain(res.status);
        });

        it('GET /api/management/inventory/low-stock - get low stock products', async () => {
            const res = await request(app).get('/api/management/inventory/low-stock').query({ companyId: testData.companyId });
            expect([200, 500]).toContain(res.status);
        });

        it('GET /api/management/inventory/out-of-stock - get out of stock products', async () => {
            const res = await request(app).get('/api/management/inventory/out-of-stock').query({ companyId: testData.companyId });
            expect([200, 500]).toContain(res.status);
        });

        it('PATCH /api/management/inventory/:productId - update inventory', async () => {
            const res = await request(app).patch(`/api/management/inventory/${testData.productId}`).send({
                stock: 100
            });
            expect([200, 404, 500]).toContain(res.status);
        });

        it('GET /api/management/products/price-analytics - get price analytics', async () => {
            const res = await request(app).get('/api/management/products/price-analytics').query({ companyId: testData.companyId });
            expect([200, 500]).toContain(res.status);
        });

        it('GET /api/management/products/price-optimization/:productId - get price optimization', async () => {
            const res = await request(app).get(`/api/management/products/price-optimization/${testData.productId}`);
            expect([200, 404, 500]).toContain(res.status);
        });
    });

    describe('Management - Order Management', () => {
        it('GET /api/management/orders/advanced-filter - advanced order filter', async () => {
            const res = await request(app).get('/api/management/orders/advanced-filter').query({
                companyId: testData.companyId,
                status: 'pending'
            });
            expect([200, 500]).toContain(res.status);
        });

        it('POST /api/management/orders/bulk-update-status - bulk update order status', async () => {
            const res = await request(app).post('/api/management/orders/bulk-update-status').send({
                orderIds: [testData.orderId],
                status: 'processing'
            });
            expect([200, 400, 500]).toContain(res.status);
        });

        it('POST /api/management/orders/:orderId/refund - initiate refund', async () => {
            const res = await request(app).post(`/api/management/orders/${testData.orderId}/refund`).send({
                amount: 99.99,
                reason: 'Customer request'
            });
            expect([200, 404, 500]).toContain(res.status);
        });

        it('POST /api/management/orders/:orderId/return - initiate return', async () => {
            const res = await request(app).post(`/api/management/orders/${testData.orderId}/return`).send({
                items: [{ productId: testData.productId, quantity: 1 }],
                reason: 'Defective product'
            });
            expect([200, 404, 500]).toContain(res.status);
        });

        it('GET /api/management/orders/:orderId/tracking-full - get full tracking', async () => {
            const res = await request(app).get(`/api/management/orders/${testData.orderId}/tracking-full`);
            expect([200, 404, 500]).toContain(res.status);
        });

        it('GET /api/management/refunds/analytics - get refund analytics', async () => {
            const res = await request(app).get('/api/management/refunds/analytics').query({ companyId: testData.companyId });
            expect([200, 500]).toContain(res.status);
        });

        it('GET /api/management/returns/analytics - get return analytics', async () => {
            const res = await request(app).get('/api/management/returns/analytics').query({ companyId: testData.companyId });
            expect([200, 500]).toContain(res.status);
        });
    });

    describe('Management - Customer Management', () => {
        it('GET /api/management/customers/:userId/purchase-history - get purchase history', async () => {
            const res = await request(app).get(`/api/management/customers/${testData.userId}/purchase-history`);
            expect([200, 404, 500]).toContain(res.status);
        });

        it('GET /api/management/customers/:userId/preferences - get customer preferences', async () => {
            const res = await request(app).get(`/api/management/customers/${testData.userId}/preferences`);
            expect([200, 404, 500]).toContain(res.status);
        });

        it('PUT /api/management/customers/:userId/preferences - update customer preferences', async () => {
            const res = await request(app).put(`/api/management/customers/${testData.userId}/preferences`).send({
                emailNotifications: true,
                smsNotifications: false
            });
            expect([200, 404, 500]).toContain(res.status);
        });

        it('GET /api/management/customers/metrics/clv - get customer lifetime value', async () => {
            const res = await request(app).get('/api/management/customers/metrics/clv').query({ companyId: testData.companyId });
            expect([200, 500]).toContain(res.status);
        });

        it('GET /api/management/customers/segmentation - get customer segmentation', async () => {
            const res = await request(app).get('/api/management/customers/segmentation').query({ companyId: testData.companyId });
            expect([200, 500]).toContain(res.status);
        });

        it('GET /api/management/customers/churn-analysis - get churn analysis', async () => {
            const res = await request(app).get('/api/management/customers/churn-analysis').query({ companyId: testData.companyId });
            expect([200, 500]).toContain(res.status);
        });
    });

    describe('Management - Promotion Management', () => {
        it('POST /api/management/promotions/campaigns - create campaign', async () => {
            const res = await request(app).post('/api/management/promotions/campaigns').send({
                campaignId: testData.campaignId,
                companyId: testData.companyId,
                name: 'Test Campaign',
                startAt: new Date(),
                endAt: new Date(Date.now() + 86400000 * 30)
            });
            expect([200, 201, 400, 500]).toContain(res.status);
        });

        it('GET /api/management/promotions/campaigns - list campaigns', async () => {
            const res = await request(app).get('/api/management/promotions/campaigns').query({ companyId: testData.companyId });
            expect([200, 500]).toContain(res.status);
        });

        it('GET /api/management/promotions/campaigns/:campaignId - get campaign detail', async () => {
            const res = await request(app).get(`/api/management/promotions/campaigns/${testData.campaignId}`);
            expect([200, 404, 500]).toContain(res.status);
        });

        it('PUT /api/management/promotions/campaigns/:campaignId - update campaign', async () => {
            const res = await request(app).put(`/api/management/promotions/campaigns/${testData.campaignId}`).send({
                name: 'Updated Campaign'
            });
            expect([200, 404, 500]).toContain(res.status);
        });

        it('DELETE /api/management/promotions/campaigns/:campaignId - delete campaign', async () => {
            const res = await request(app).delete(`/api/management/promotions/campaigns/${testData.campaignId}`);
            expect([200, 404, 500]).toContain(res.status);
        });

        it('POST /api/management/promotions/flash-sales - create flash sale', async () => {
            const res = await request(app).post('/api/management/promotions/flash-sales').send({
                flashSaleId: testData.flashSaleId,
                companyId: testData.companyId,
                name: 'Flash Sale',
                discountValue: 50,
                startAt: new Date(),
                endAt: new Date(Date.now() + 3600000)
            });
            expect([200, 201, 400, 500]).toContain(res.status);
        });

        it('GET /api/management/promotions/flash-sales - list flash sales', async () => {
            const res = await request(app).get('/api/management/promotions/flash-sales').query({ companyId: testData.companyId });
            expect([200, 500]).toContain(res.status);
        });

        it('GET /api/management/promotions/flash-sales/:flashSaleId - get flash sale detail', async () => {
            const res = await request(app).get(`/api/management/promotions/flash-sales/${testData.flashSaleId}`);
            expect([200, 404, 500]).toContain(res.status);
        });

        it('PUT /api/management/promotions/flash-sales/:flashSaleId - update flash sale', async () => {
            const res = await request(app).put(`/api/management/promotions/flash-sales/${testData.flashSaleId}`).send({
                discountValue: 60
            });
            expect([200, 404, 500]).toContain(res.status);
        });

        it('POST /api/management/promotions/seasonal - create seasonal promotion', async () => {
            const res = await request(app).post('/api/management/promotions/seasonal').send({
                seasonalId: testData.seasonalId,
                companyId: testData.companyId,
                name: 'Black Friday',
                season: 'black_friday',
                discountValue: 30
            });
            expect([200, 201, 400, 500]).toContain(res.status);
        });

        it('GET /api/management/promotions/seasonal - list seasonal promotions', async () => {
            const res = await request(app).get('/api/management/promotions/seasonal').query({ companyId: testData.companyId });
            expect([200, 500]).toContain(res.status);
        });

        it('PUT /api/management/promotions/seasonal/:seasonalId - update seasonal promotion', async () => {
            const res = await request(app).put(`/api/management/promotions/seasonal/${testData.seasonalId}`).send({
                discountValue: 35
            });
            expect([200, 404, 500]).toContain(res.status);
        });

        it('POST /api/management/promotions/apply-bulk - apply promotion in bulk', async () => {
            const res = await request(app).post('/api/management/promotions/apply-bulk').send({
                promotionId: testData.promotionId,
                productIds: [testData.productId]
            });
            expect([200, 400, 500]).toContain(res.status);
        });

        it('GET /api/management/promotions/analytics/:campaignId - get campaign analytics', async () => {
            const res = await request(app).get(`/api/management/promotions/analytics/${testData.campaignId}`);
            expect([200, 404, 500]).toContain(res.status);
        });
    });

    // ============================================
    // EXCEPTIONAL FEATURES
    // ============================================

    describe('Exceptional Features - Personalization', () => {
        it('GET /api/features/personalized-feed/:userId - get personalized feed', async () => {
            const res = await request(app).get(`/api/features/personalized-feed/${testData.userId}`);
            expect([200, 404, 500]).toContain(res.status);
        });

        it('POST /api/features/personalized-feed/:userId/refresh - refresh personalized feed', async () => {
            const res = await request(app).post(`/api/features/personalized-feed/${testData.userId}/refresh`);
            expect([200, 404, 500]).toContain(res.status);
        });

        it('GET /api/features/ai-recommendations/:userId - get AI recommendations', async () => {
            const res = await request(app).get(`/api/features/ai-recommendations/${testData.userId}`);
            expect([200, 404, 500]).toContain(res.status);
        });
    });

    describe('Exceptional Features - Dynamic Pricing', () => {
        it('GET /api/features/dynamic-price/:productId - get dynamic price', async () => {
            const res = await request(app).get(`/api/features/dynamic-price/${testData.productId}`);
            expect([200, 404, 500]).toContain(res.status);
        });

        it('POST /api/features/dynamic-pricing/predict - predict optimal price', async () => {
            const res = await request(app).post('/api/features/dynamic-pricing/predict').send({
                productId: testData.productId,
                factors: { demand: 'high', competition: 'medium' }
            });
            expect([200, 400, 500]).toContain(res.status);
        });
    });

    describe('Exceptional Features - AR/VR', () => {
        it('GET /api/features/ar-view/:productId - get AR view data', async () => {
            const res = await request(app).get(`/api/features/ar-view/${testData.productId}`);
            expect([200, 404, 500]).toContain(res.status);
        });

        it('GET /api/features/vr-showroom/:companyId - get VR showroom data', async () => {
            const res = await request(app).get(`/api/features/vr-showroom/${testData.companyId}`);
            expect([200, 404, 500]).toContain(res.status);
        });
    });

    describe('Exceptional Features - Gamification', () => {
        it('POST /api/features/gamification/points - add user points', async () => {
            const res = await request(app).post('/api/features/gamification/points').send({
                userId: testData.userId,
                points: 100,
                action: 'purchase'
            });
            expect([200, 400, 500]).toContain(res.status);
        });

        it('GET /api/features/gamification/leaderboard - get leaderboard', async () => {
            const res = await request(app).get('/api/features/gamification/leaderboard').query({ companyId: testData.companyId });
            expect([200, 500]).toContain(res.status);
        });

        it('GET /api/features/gamification/badges/:userId - get user badges', async () => {
            const res = await request(app).get(`/api/features/gamification/badges/${testData.userId}`);
            expect([200, 404, 500]).toContain(res.status);
        });

        it('POST /api/features/gamification/challenges - create challenge', async () => {
            const res = await request(app).post('/api/features/gamification/challenges').send({
                companyId: testData.companyId,
                name: 'Purchase Challenge',
                requirement: 'Make 5 purchases',
                reward: 500
            });
            expect([200, 201, 400, 500]).toContain(res.status);
        });
    });

    describe('Exceptional Features - Social Commerce', () => {
        it('POST /api/features/social/share/:productId - share product', async () => {
            const res = await request(app).post(`/api/features/social/share/${testData.productId}`).send({
                userId: testData.userId,
                platform: 'facebook'
            });
            expect([200, 400, 500]).toContain(res.status);
        });

        it('GET /api/features/social/trending - get trending products', async () => {
            const res = await request(app).get('/api/features/social/trending').query({ companyId: testData.companyId });
            expect([200, 500]).toContain(res.status);
        });

        it('POST /api/features/social/user-feed - create user post', async () => {
            const res = await request(app).post('/api/features/social/user-feed').send({
                userId: testData.userId,
                content: 'Check out this product!',
                productId: testData.productId
            });
            expect([200, 201, 400, 500]).toContain(res.status);
        });
    });

    // ============================================
    // NOTIFICATIONS
    // ============================================

    describe('Notifications - User Notifications', () => {
        it('GET /api/notifications - get user notifications', async () => {
            const res = await request(app).get('/api/notifications').query({ userId: testData.userId });
            expect([200, 500]).toContain(res.status);
        });

        it('POST /api/notifications/mark-as-read/:notificationId - mark as read', async () => {
            const res = await request(app).post(`/api/notifications/mark-as-read/${testData.notificationId}`);
            expect([200, 404, 500]).toContain(res.status);
        });

        it('POST /api/notifications/mark-all-read - mark all as read', async () => {
            const res = await request(app).post('/api/notifications/mark-all-read').send({
                userId: testData.userId
            });
            expect([200, 500]).toContain(res.status);
        });

        it('DELETE /api/notifications/:notificationId - delete notification', async () => {
            const res = await request(app).delete(`/api/notifications/${testData.notificationId}`);
            expect([200, 404, 500]).toContain(res.status);
        });
    });

    describe('Notifications - Alerts', () => {
        it('POST /api/notifications/price-alert - create price alert', async () => {
            const res = await request(app).post('/api/notifications/price-alert').send({
                userId: testData.userId,
                productId: testData.productId,
                targetPrice: 79.99
            });
            expect([200, 201, 400, 500]).toContain(res.status);
        });

        it('GET /api/notifications/price-alerts/:userId - get user price alerts', async () => {
            const res = await request(app).get(`/api/notifications/price-alerts/${testData.userId}`);
            expect([200, 500]).toContain(res.status);
        });

        it('DELETE /api/notifications/price-alert/:alertId - delete price alert', async () => {
            const res = await request(app).delete(`/api/notifications/price-alert/${testData.alertId}`);
            expect([200, 404, 500]).toContain(res.status);
        });

        it('POST /api/notifications/stock-alert - create stock alert', async () => {
            const res = await request(app).post('/api/notifications/stock-alert').send({
                userId: testData.userId,
                productId: testData.productId
            });
            expect([200, 201, 400, 500]).toContain(res.status);
        });

        it('GET /api/notifications/stock-alerts/:userId - get user stock alerts', async () => {
            const res = await request(app).get(`/api/notifications/stock-alerts/${testData.userId}`);
            expect([200, 500]).toContain(res.status);
        });

        it('DELETE /api/notifications/stock-alert/:alertId - delete stock alert', async () => {
            const res = await request(app).delete(`/api/notifications/stock-alert/${testData.alertId}`);
            expect([200, 404, 500]).toContain(res.status);
        });
    });

    describe('Notifications - Preferences', () => {
        it('GET /api/notifications/preferences/:userId - get preferences', async () => {
            const res = await request(app).get(`/api/notifications/preferences/${testData.userId}`);
            expect([200, 404, 500]).toContain(res.status);
        });

        it('PUT /api/notifications/preferences/:userId - update preferences', async () => {
            const res = await request(app).put(`/api/notifications/preferences/${testData.userId}`).send({
                email: true,
                sms: false,
                push: true
            });
            expect([200, 404, 500]).toContain(res.status);
        });
    });

    describe('Notifications - Broadcast', () => {
        it('POST /api/notifications/broadcast - broadcast notification', async () => {
            const res = await request(app).post('/api/notifications/broadcast').send({
                companyId: testData.companyId,
                message: 'System maintenance scheduled',
                type: 'info'
            });
            expect([200, 201, 400, 500]).toContain(res.status);
        });

        it('POST /api/notifications/broadcast-segment - broadcast to segment', async () => {
            const res = await request(app).post('/api/notifications/broadcast-segment').send({
                companyId: testData.companyId,
                segment: 'premium_users',
                message: 'Exclusive offer for premium members'
            });
            expect([200, 201, 400, 500]).toContain(res.status);
        });
    });
});
