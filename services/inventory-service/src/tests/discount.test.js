const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');
const Discount = require('../src/models/Discount');
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
  await Discount.deleteMany({});
  await Product.deleteMany({});
  await Category.deleteMany({});
});

afterEach(async () => {
  await Discount.deleteMany({});
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

const discountData = {
  companyId: 'seller123',
  name: 'Summer Sale',
  type: 'percentage',
  value: 10,
  startDate: '2025-09-01',
  endDate: '2025-09-30',
  minPurchaseAmount: 0,
  maxDiscountAmount: 0,
  isActive: true,
};

describe('Discount Routes', () => {
  describe('POST /api/v1/discounts', () => {
    let productId;

    beforeEach(async () => {
      const category = await new Category(categoryData).save();
      productData.categoryId = category._id;
      const product = await new Product(productData).save();
      productId = product._id;
      discountData.productId = productId;
    });

    it('should create a discount', async () => {
      const res = await request(app)
        .post('/api/v1/discounts')
        .send(discountData);
      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.name).toBe('Summer Sale');
      expect(res.body.data.type).toBe('percentage');
    });

    it('should fail to create discount with invalid date range', async () => {
      const res = await request(app)
        .post('/api/v1/discounts')
        .send({ ...discountData, startDate: '2025-10-01', endDate: '2025-09-01' });
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error', 'Start date must be before end date');
    });
  });

  describe('GET /api/v1/discounts/active/:productId', () => {
    let productId;

    beforeEach(async () => {
      const category = await new Category(categoryData).save();
      productData.categoryId = category._id;
      const product = await new Product(productData).save();
      productId = product._id;
      discountData.productId = productId;
      await new Discount(discountData).save();
    });

    it('should get active discounts', async () => {
      const res = await request(app).get(`/api/v1/discounts/active/${productId}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Summer Sale');
    });
  });
});