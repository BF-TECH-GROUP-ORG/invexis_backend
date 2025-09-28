const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');
const Product = require('../src/models/Product');
const Category = require('../src/models/Category');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('../src/middleware/auth', () => (req, res, next) => {
  req.user = { companyId: 'seller123', _id: 'user123' };
  next();
});

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Product.deleteMany({});
  await Category.deleteMany({});
});

afterEach(async () => {
  await Product.deleteMany({});
  await Category.deleteMany({});
});

const categoryData = {
  companyId: 'seller123',
  name: 'Fashion',
  level: 1,
};

const productData = {
  companyId: 'seller123',
  asin: 'B001',
  sku: 'SKU001',
  title: 'T-Shirt',
  description: 'Comfortable cotton T-shirt',
  brand: 'BrandX',
  price: 19.99,
  stockQty: 100,
  condition: 'new',
  availability: 'in_stock',
  scheduledAvailabilityDate: null,
};

describe('Product Routes', () => {
  describe('POST /api/v1/products', () => {
    let categoryId;

    beforeEach(async () => {
      const category = await new Category(categoryData).save();
      categoryId = category._id;
      productData.categoryId = categoryId;
    });

    it('should create a new product', async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .send(productData);
      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('asin', 'B001');
      expect(res.body.data.title).toBe('T-Shirt');
    });

    it('should fail to create product with duplicate asin', async () => {
      await request(app).post('/api/v1/products').send(productData);
      const res = await request(app)
        .post('/api/v1/products')
        .send({ ...productData, sku: 'SKU002' });
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error', 'Duplicate key error');
    });

    it('should fail to create product with invalid categoryId', async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .send({ ...productData, categoryId: 'invalid_id' });
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error', 'Invalid MongoDB ID');
    });
  });

  describe('PUT /api/v1/products/:productId', () => {
    let productId;

    beforeEach(async () => {
      const category = await new Category(categoryData).save();
      productData.categoryId = category._id;
      const product = await new Product(productData).save();
      productId = product._id;
    });

    it('should update a product', async () => {
      const res = await request(app)
        .put(`/api/v1/products/${productId}`)
        .send({ title: 'Updated T-Shirt' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.title).toBe('Updated T-Shirt');
    });

    it('should fail to update non-existent product', async () => {
      const res = await request(app)
        .put('/api/v1/products/000000000000000000000000')
        .send({ title: 'Invalid' });
      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error', 'Product not found');
    });
  });

  describe('DELETE /api/v1/products/:productId', () => {
    let productId;

    beforeEach(async () => {
      const category = await new Category(categoryData).save();
      productData.categoryId = category._id;
      const product = await new Product(productData).save();
      productId = product._id;
    });

    it('should delete a product', async () => {
      const res = await request(app).delete(`/api/v1/products/${productId}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.message).toBe('Product deleted');
    });

    it('should fail to delete non-existent product', async () => {
      const res = await request(app).delete('/api/v1/products/000000000000000000000000');
      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error', 'Product not found');
    });
  });

  describe('GET /api/v1/products/old-unbought', () => {
    beforeEach(async () => {
      const category = await new Category(categoryData).save();
      productData.categoryId = category._id;
      productData.createdAt = new Date('2025-08-01');
      productData.salesRank = 0;
      await new Product(productData).save();
    });

    it('should get old unbought products', async () => {
      const res = await request(app).get('/api/v1/products/old-unbought?daysOld=30');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe('T-Shirt');
    });
  });
});