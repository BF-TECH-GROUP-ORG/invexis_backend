const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const ecommerceRoute = require('../src/routes/ecommerceRoute');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use('/ecommerce', ecommerceRoute);

beforeAll(async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ecommerce_test';
  console.time('MongoDB Connect');
  await mongoose.connect(uri);
  console.timeEnd('MongoDB Connect');
});

beforeEach(async () => {
  // Check if product exists; insert only if it doesn't
  const existingProduct = await mongoose.connection.db.collection('products').findOne({
    productId: exampleProduct.productId,
    companyId: exampleProduct.companyId // Ensure uniqueness with companyId
  });
  if (!existingProduct) {
    try {
      const result = await mongoose.connection.db.collection('products').insertOne({
        ...exampleProduct,
        _id: undefined // Prevent duplicate _id errors
      });
      console.log('Inserted product:', result.insertedId);
    } catch (error) {
      console.error('Error inserting product in beforeEach:', error);
    }
  } else {
    console.log('Product already exists:', existingProduct._id);
    if (!existingProduct.title || Object.keys(existingProduct.title).length === 0) {
      console.warn('Product title is empty:', existingProduct);
    }
  }
});

afterAll(async () => {
  // Only disconnect, do not drop the database to retain data
  await mongoose.disconnect();
});

// Example data for each model with unique identifiers
const uniqueSuffix = Date.now();
const exampleCart = {
  userId: `user1-${uniqueSuffix}`,
  items: [
    { productId: 'prod1', quantity: 2, priceAtAdd: 10, currency: 'USD' }
  ],
  status: 'active',
  lastActivity: new Date(),
  isDeleted: false
};

const exampleProduct = {
  productId: 'prod1',
  companyId: `test-company-${uniqueSuffix}`,
  title: { en: 'Test Product' },
  price: 10,
  currency: 'USD'
};

const exampleOrder = {
  orderId: `order1-${uniqueSuffix}`,
  userId: `user1-${uniqueSuffix}`,
  items: [
    { productId: 'prod1', quantity: 1, priceAtOrder: 10, currency: 'USD' }
  ],
  subtotal: 10,
  totalAmount: 10,
  currency: 'USD'
};

const examplePromotion = {
  promotionId: `promo1-${uniqueSuffix}`,
  companyId: `test-company-${uniqueSuffix}`,
  name: 'Test Promo',
  discountType: 'percentage',
  discountValue: 10,
  startAt: new Date(),
  endAt: new Date(Date.now() + 86400000)
};

const exampleReview = {
  reviewId: `review1-${uniqueSuffix}`,
  userId: `user1-${uniqueSuffix}`,
  productId: 'prod1',
  companyId: `test-company-${uniqueSuffix}`,
  rating: 5
};

const exampleWishlist = {
  userId: `user1-${uniqueSuffix}`,
  items: [{ productId: 'prod1' }]
};

const exampleBanner = {
  bannerId: `banner1-${uniqueSuffix}`,
  companyId: `test-company-${uniqueSuffix}`,
  shopId: `test-shop-${uniqueSuffix}`,
  title: { en: 'Test Banner' },
  subtitle: { en: 'Test Subtitle' },
  imageUrl: 'https://example.com/banner.jpg',
  target: { type: 'product', id: 'prod1' },
  type: 'homepage',
  priority: 1,
  startAt: new Date(),
  endAt: new Date(Date.now() + 86400000),
  isActive: true,
  isDeleted: false
};

describe('Ecommerce Service Routes', () => {
  // Cart
  it('POST /ecommerce/cart - create cart', async () => {
    const res = await request(app).post('/ecommerce/cart').send(exampleCart);
    if (res.status >= 400) {
      console.log('POST /ecommerce/cart error:', res.body);
    }
    expect(res.status).toBe(200); // Matches actual response
    expect(res.body).toHaveProperty('_id');
    expect(res.body.userId).toBe(exampleCart.userId);
  }, 10000);

  it('GET /ecommerce/cart', async () => {
    const res = await request(app).get('/ecommerce/cart').query({ userId: exampleCart.userId });
    expect(res.status).toBe(200);
  });

  it('POST /ecommerce/cart/remove', async () => {
    const res = await request(app).post('/ecommerce/cart/remove').send({ userId: exampleCart.userId, productId: 'prod1' });
    expect(res.status).toBe(200);
  });

  it('POST /ecommerce/cart/checkout', async () => {
    const res = await request(app).post('/ecommerce/cart/checkout').send({ userId: exampleCart.userId });
    expect(res.status).toBe(200);
  });

  // Catalog
  it('POST /ecommerce/products', async () => {
    const res = await request(app).post('/ecommerce/products').send(exampleProduct);
    expect(res.status).toBe(201);
  });

  it('GET /ecommerce/products', async () => {
    const res = await request(app).get('/ecommerce/products');
    expect(res.status).toBe(200);
  });

  it('GET /ecommerce/products/:id', async () => {
    const res = await request(app).get(`/ecommerce/products/${exampleProduct.productId}`);
    expect(res.status).toBe(200);
  });

  it('PUT /ecommerce/products/:id', async () => {
    const res = await request(app).put(`/ecommerce/products/${exampleProduct.productId}`).send(exampleProduct);
    expect(res.status).toBe(200);
  });

  it('DELETE /ecommerce/products/:id', async () => {
    const res = await request(app).delete(`/ecommerce/products/${exampleProduct.productId}`);
    expect(res.status).toBe(200);
  });

  // Orders
  it('POST /ecommerce/orders', async () => {
    const res = await request(app).post('/ecommerce/orders').send(exampleOrder);
    expect(res.status).toBe(201);
  });

  it('GET /ecommerce/orders', async () => {
    const res = await request(app).get('/ecommerce/orders');
    expect(res.status).toBe(200);
  });

  it('GET /ecommerce/orders/:id', async () => {
    const res = await request(app).get(`/ecommerce/orders/${exampleOrder.orderId}`);
    expect(res.status).toBe(200);
  });

  it('PUT /ecommerce/orders/:id', async () => {
    const res = await request(app).put(`/ecommerce/orders/${exampleOrder.orderId}`).send(exampleOrder);
    expect(res.status).toBe(200);
  });

  // Promotions
  it('POST /ecommerce/promotions', async () => {
    const res = await request(app).post('/ecommerce/promotions').send(examplePromotion);
    expect(res.status).toBe(201);
  });

  it('GET /ecommerce/promotions', async () => {
    const res = await request(app).get('/ecommerce/promotions');
    expect(res.status).toBe(200);
  });

  it('GET /ecommerce/promotions/:id', async () => {
    const res = await request(app).get(`/ecommerce/promotions/${examplePromotion.promotionId}`);
    expect(res.status).toBe(200);
  });

  it('PUT /ecommerce/promotions/:id', async () => {
    const res = await request(app).put(`/ecommerce/promotions/${examplePromotion.promotionId}`).send(examplePromotion);
    expect(res.status).toBe(200);
  });

  it('DELETE /ecommerce/promotions/:id', async () => {
    const res = await request(app).delete(`/ecommerce/promotions/${examplePromotion.promotionId}`);
    expect(res.status).toBe(200);
  });

  // Reviews
  it('POST /ecommerce/reviews', async () => {
    const res = await request(app).post('/ecommerce/reviews').send(exampleReview);
    expect(res.status).toBe(201);
  });

  it('GET /ecommerce/reviews', async () => {
    const res = await request(app).get('/ecommerce/reviews');
    expect(res.status).toBe(200);
  });

  it('GET /ecommerce/reviews/:id', async () => {
    const res = await request(app).get(`/ecommerce/reviews/${exampleReview.reviewId}`);
    expect(res.status).toBe(200);
  });

  it('PATCH /ecommerce/reviews/:id/approve', async () => {
    const res = await request(app).patch(`/ecommerce/reviews/${exampleReview.reviewId}/approve`);
    expect(res.status).toBe(200);
  });

  it('DELETE /ecommerce/reviews/:id', async () => {
    const res = await request(app).delete(`/ecommerce/reviews/${exampleReview.reviewId}`);
    expect(res.status).toBe(200);
  });

  // Wishlist
  it('POST /ecommerce/wishlist', async () => {
    const res = await request(app).post('/ecommerce/wishlist').send(exampleWishlist);
    expect(res.status).toBe(200); // Updated to match actual response
  });

  it('GET /ecommerce/wishlist', async () => {
    const res = await request(app).get('/ecommerce/wishlist').query({ userId: exampleWishlist.userId, companyId: exampleWishlist.companyId });
    expect(res.status).toBe(200);
  });

  it('POST /ecommerce/wishlist/remove', async () => {
    const res = await request(app).post('/ecommerce/wishlist/remove').send({ userId: exampleWishlist.userId, companyId: exampleWishlist.companyId, productId: 'prod1' });
    expect(res.status).toBe(200);
  });

  // Featured Banners
  describe('Featured Banner Routes', () => {
    let createdBannerId;

    it('POST /ecommerce/banners - create banner', async () => {
      const res = await request(app).post('/ecommerce/banners').send(exampleBanner);
      if (res.status >= 400) {
        console.log('POST /ecommerce/banners error:', res.body);
      }
      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('_id');
      expect(res.body.data.bannerId).toBe(exampleBanner.bannerId);
      expect(res.body.data.companyId).toBe(exampleBanner.companyId);
      createdBannerId = res.body.data.bannerId; // Store for subsequent tests
    }, 10000);

    it('GET /ecommerce/banners - list banners', async () => {
      const res = await request(app).get('/ecommerce/banners').query({ companyId: exampleBanner.companyId });
      if (res.status >= 400) {
        console.log('GET /ecommerce/banners error:', res.body);
      }
      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
    }, 10000);

    it('GET /ecommerce/banners/:companyId/:bannerId - get banner', async () => {
      const res = await request(app).get(`/ecommerce/banners/${exampleBanner.companyId}/${createdBannerId}`);
      if (res.status >= 400) {
        console.log('GET /ecommerce/banners/:companyId/:bannerId error:', res.body);
      }
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('bannerId', createdBannerId);
    }, 10000);

    it('PUT /ecommerce/banners/:companyId/:bannerId - update banner', async () => {
      const res = await request(app)
        .put(`/ecommerce/banners/${exampleBanner.companyId}/${createdBannerId}`)
        .send({ title: { en: 'Updated Banner' }, priority: 2 });
      if (res.status >= 400) {
        console.log('PUT /ecommerce/banners/:companyId/:bannerId error:', res.body);
      }
      expect(res.status).toBe(200);
      expect(res.body.data.title.en).toBe('Updated Banner');
    }, 10000);

    it('PATCH /ecommerce/banners/:companyId/:bannerId/active - toggle active', async () => {
      const res = await request(app)
        .patch(`/ecommerce/banners/${exampleBanner.companyId}/${createdBannerId}/active`)
        .send({ isActive: false });
      if (res.status >= 400) {
        console.log('PATCH /ecommerce/banners/:companyId/:bannerId/active error:', res.body);
      }
      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(false);
    }, 10000);

    it('DELETE /ecommerce/banners/:companyId/:bannerId - delete banner', async () => {
      const res = await request(app).delete(`/ecommerce/banners/${exampleBanner.companyId}/${createdBannerId}`);
      if (res.status >= 400) {
        console.log('DELETE /ecommerce/banners/:companyId/:bannerId error:', res.body);
      }
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    }, 10000);
  });
});