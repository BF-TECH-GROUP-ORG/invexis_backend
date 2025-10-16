const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');
const StockChange = require('../src/models/StockChange');
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
  await StockChange.deleteMany({});
  await Product.deleteMany({});
  await Category.deleteMany({});
});

afterEach(async () => {
  await StockChange.deleteMany({});
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

const stockChangeData = {
  companyId: 'seller123',
  changeType: 'restock',
  quantity: 50,
  previousStock: 100,
  reason: 'New shipment',
};

describe('StockChange Routes', () => {
  describe('POST /api/v1/stock-changes', () => {
    let productId;

    beforeEach(async () => {
      const category = await new Category(categoryData).save();
      productData.categoryId = category._id;
      const product = await new Product(productData).save();
      productId = product._id;
      stockChangeData.productId = productId;
    });

    it('should create a stock change and update product stock', async () => {
      const res = await request(app)
        .post('/api/v1/stock-changes')
        .send(stockChangeData);
      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.quantity).toBe(50);
      expect(res.body.data.newStock).toBe(150);

      const product = await Product.findById(productId);
      expect(product.stockQty).toBe(150);
    });

    it('should fail to create stock change with zero quantity', async () => {
      const res = await request(app)
        .post('/api/v1/stock-changes')
        .send({ ...stockChangeData, quantity: 0 });
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error', 'Quantity cannot be zero');
    });

    it('should fail to create stock change with negative restock quantity', async () => {
      const res = await request(app)
        .post('/api/v1/stock-changes')
        .send({ ...stockChangeData, quantity: -10 });
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error', 'Quantity must be positive for restock or return');
    });
  });

  describe('GET /api/v1/stock-changes/history/:productId', () => {
    let productId;

    beforeEach(async () => {
      const category = await new Category(categoryData).save();
      productData.categoryId = category._id;
      const product = await new Product(productData).save();
      productId = product._id;
      stockChangeData.productId = productId;
      await new StockChange(stockChangeData).save();
    });

    it('should get stock change history', async () => {
      const res = await request(app).get(`/api/v1/stock-changes/history/${productId}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].changeType).toBe('restock');
    });
  });
});