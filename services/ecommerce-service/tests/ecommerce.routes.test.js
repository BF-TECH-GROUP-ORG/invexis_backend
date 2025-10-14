const request = require('supertest');
const express = require('express');
const ecommerceRoute = require('../src/routes/ecommerceRoute');

const app = express();
app.use(express.json());
app.use('/ecommerce', ecommerceRoute);

// Mock DB connection (skip actual DB for route tests)
jest.mock('../src/config/db', () => jest.fn());

// Example data for each model
const exampleCart = {
  companyId: 'test-company',
  shopId: 'test-shop',
  items: [
    { productId: 'prod1', quantity: 2, priceAtAdd: 10, currency: 'USD' }
  ],
  status: 'active',
  lastActivity: new Date(),
  isDeleted: false
};

const exampleProduct = {
  productId: 'prod1',
  companyId: 'test-company',
  title: { en: 'Test Product' },
  price: 10,
  currency: 'USD'
};

const exampleOrder = {
  orderId: 'order1',
  userId: 'user1',
  companyId: 'test-company',
  items: [
    { productId: 'prod1', quantity: 1, priceAtOrder: 10, currency: 'USD' }
  ],
  subtotal: 10,
  totalAmount: 10,
  currency: 'USD'
};

const examplePromotion = {
  promotionId: 'promo1',
  companyId: 'test-company',
  name: 'Test Promo',
  discountType: 'percentage',
  discountValue: 10,
  startAt: new Date(),
  endAt: new Date(Date.now() + 86400000)
};

const exampleReview = {
  reviewId: 'review1',
  userId: 'user1',
  productId: 'prod1',
  companyId: 'test-company',
  rating: 5
};

const exampleWishlist = {
  userId: 'user1',
  companyId: 'test-company',
  items: [ { productId: 'prod1' } ]
};

describe('Ecommerce Service Routes', () => {
  // Cart
  it('POST /ecommerce/cart - create cart', async () => {
    const res = await request(app).post('/ecommerce/cart').send(exampleCart);
    expect(res.status).toBeLessThan(500); // Accepts 201, 400, etc.
  });
  it('GET /ecommerce/cart', async () => {
    const res = await request(app).get('/ecommerce/cart').query({ companyId: exampleCart.companyId });
    expect(res.status).toBeLessThan(500);
  });
  it('POST /ecommerce/cart/remove', async () => {
    const res = await request(app).post('/ecommerce/cart/remove').send({ companyId: exampleCart.companyId, productId: 'prod1' });
    expect(res.status).toBeLessThan(500);
  });
  it('POST /ecommerce/cart/checkout', async () => {
    const res = await request(app).post('/ecommerce/cart/checkout').send({ companyId: exampleCart.companyId });
    expect(res.status).toBeLessThan(500);
  });

  // Catalog
  it('POST /ecommerce/products', async () => {
    const res = await request(app).post('/ecommerce/products').send(exampleProduct);
    expect(res.status).toBeLessThan(500);
  });
  it('GET /ecommerce/products', async () => {
    const res = await request(app).get('/ecommerce/products');
    expect(res.status).toBeLessThan(500);
  });
  it('GET /ecommerce/products/:id', async () => {
    const res = await request(app).get(`/ecommerce/products/${exampleProduct.productId}`);
    expect(res.status).toBeLessThan(500);
  });
  it('PUT /ecommerce/products/:id', async () => {
    const res = await request(app).put(`/ecommerce/products/${exampleProduct.productId}`).send(exampleProduct);
    expect(res.status).toBeLessThan(500);
  });
  it('DELETE /ecommerce/products/:id', async () => {
    const res = await request(app).delete(`/ecommerce/products/${exampleProduct.productId}`);
    expect(res.status).toBeLessThan(500);
  });

  // Orders
  it('POST /ecommerce/orders', async () => {
    const res = await request(app).post('/ecommerce/orders').send(exampleOrder);
    expect(res.status).toBeLessThan(500);
  });
  it('GET /ecommerce/orders', async () => {
    const res = await request(app).get('/ecommerce/orders');
    expect(res.status).toBeLessThan(500);
  });
  it('GET /ecommerce/orders/:id', async () => {
    const res = await request(app).get(`/ecommerce/orders/${exampleOrder.orderId}`);
    expect(res.status).toBeLessThan(500);
  });
  it('PUT /ecommerce/orders/:id', async () => {
    const res = await request(app).put(`/ecommerce/orders/${exampleOrder.orderId}`).send(exampleOrder);
    expect(res.status).toBeLessThan(500);
  });

  // Promotions
  it('POST /ecommerce/promotions', async () => {
    const res = await request(app).post('/ecommerce/promotions').send(examplePromotion);
    expect(res.status).toBeLessThan(500);
  });
  it('GET /ecommerce/promotions', async () => {
    const res = await request(app).get('/ecommerce/promotions');
    expect(res.status).toBeLessThan(500);
  });
  it('GET /ecommerce/promotions/:id', async () => {
    const res = await request(app).get(`/ecommerce/promotions/${examplePromotion.promotionId}`);
    expect(res.status).toBeLessThan(500);
  });
  it('PUT /ecommerce/promotions/:id', async () => {
    const res = await request(app).put(`/ecommerce/promotions/${examplePromotion.promotionId}`).send(examplePromotion);
    expect(res.status).toBeLessThan(500);
  });
  it('DELETE /ecommerce/promotions/:id', async () => {
    const res = await request(app).delete(`/ecommerce/promotions/${examplePromotion.promotionId}`);
    expect(res.status).toBeLessThan(500);
  });

  // Reviews
  it('POST /ecommerce/reviews', async () => {
    const res = await request(app).post('/ecommerce/reviews').send(exampleReview);
    expect(res.status).toBeLessThan(500);
  });
  it('GET /ecommerce/reviews', async () => {
    const res = await request(app).get('/ecommerce/reviews');
    expect(res.status).toBeLessThan(500);
  });
  it('GET /ecommerce/reviews/:id', async () => {
    const res = await request(app).get(`/ecommerce/reviews/${exampleReview.reviewId}`);
    expect(res.status).toBeLessThan(500);
  });
  it('PATCH /ecommerce/reviews/:id/approve', async () => {
    const res = await request(app).patch(`/ecommerce/reviews/${exampleReview.reviewId}/approve`);
    expect(res.status).toBeLessThan(500);
  });
  it('DELETE /ecommerce/reviews/:id', async () => {
    const res = await request(app).delete(`/ecommerce/reviews/${exampleReview.reviewId}`);
    expect(res.status).toBeLessThan(500);
  });

  // Wishlist
  it('POST /ecommerce/wishlist', async () => {
    const res = await request(app).post('/ecommerce/wishlist').send(exampleWishlist);
    expect(res.status).toBeLessThan(500);
  });
  it('GET /ecommerce/wishlist', async () => {
    const res = await request(app).get('/ecommerce/wishlist').query({ userId: exampleWishlist.userId, companyId: exampleWishlist.companyId });
    expect(res.status).toBeLessThan(500);
  });
  it('POST /ecommerce/wishlist/remove', async () => {
    const res = await request(app).post('/ecommerce/wishlist/remove').send({ userId: exampleWishlist.userId, companyId: exampleWishlist.companyId, productId: 'prod1' });
    expect(res.status).toBeLessThan(500);
  });
});
