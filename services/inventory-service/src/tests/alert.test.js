const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');
const Alert = require('../src/models/Alert');
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
  await Alert.deleteMany({});
  await Product.deleteMany({});
  await Category.deleteMany({});
});

afterEach(async () => {
  await Alert.deleteMany({});
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
};

const alertData = {
  companyId: 'seller123',
  type: 'low_stock',
  threshold: 10,
  message: 'Low stock alert for T-Shirt',
  priority: 'high',
};

describe('Alert Routes', () => {
  describe('POST /api/v1/alerts', () => {
    let productId;

    beforeEach(async () => {
      const category = await new Category(categoryData).save();
      productData.categoryId = category._id;
      const product = await new Product(productData).save();
      productId = product._id;
      alertData.productId = productId;
    });

    it('should create an alert', async () => {
      const res = await request(app)
        .post('/api/v1/alerts')
        .send(alertData);
      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.type).toBe('low_stock');
      expect(res.body.data.message).toBe('Low stock alert for T-Shirt');
    });

    it('should fail to create alert without threshold for low_stock', async () => {
      const res = await request(app)
        .post('/api/v1/alerts')
        .send({ ...alertData, threshold: null });
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error', 'Threshold required for stock alerts');
    });
  });

  describe('GET /api/v1/alerts/unresolved', () => {
    beforeEach(async () => {
      const category = await new Category(categoryData).save();
      productData.categoryId = category._id;
      const product = await new Product(productData).save();
      alertData.productId = product._id;
      await new Alert(alertData).save();
    });

    it('should get unresolved alerts', async () => {
      const res = await request(app).get('/api/v1/alerts/unresolved');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].type).toBe('low_stock');
    });
  });
});