const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');
const Favorite = require('../src/models/Favorite');
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
  await Favorite.deleteMany({});
  await Product.deleteMany({});
  await Category.deleteMany({});
});

afterEach(async () => {
  await Favorite.deleteMany({});
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

const favoriteData = {
  companyId: 'seller123',
  userId: 'user123',
};

describe('Favorite Routes', () => {
  describe('POST /api/v1/favorites', () => {
    let productId;

    beforeEach(async () => {
      const category = await new Category(categoryData).save();
      productData.categoryId = category._id;
      const product = await new Product(productData).save();
      productId = product._id;
      favoriteData.productId = productId;
    });

    it('should add a favorite', async () => {
      const res = await request(app)
        .post('/api/v1/favorites')
        .send({ productId });
      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.productId).toBe(productId.toString());
    });

    it('should fail to add duplicate favorite', async () => {
      await request(app).post('/api/v1/favorites').send({ productId });
      const res = await request(app)
        .post('/api/v1/favorites')
        .send({ productId });
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error', 'Product is already favorited');
    });
  });

  describe('DELETE /api/v1/favorites/:productId', () => {
    let productId;

    beforeEach(async () => {
      const category = await new Category(categoryData).save();
      productData.categoryId = category._id;
      const product = await new Product(productData).save();
      productId = product._id;
      favoriteData.productId = productId;
      await new Favorite(favoriteData).save();
    });

    it('should remove a favorite', async () => {
      const res = await request(app).delete(`/api/v1/favorites/${productId}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.message).toBe('Favorite removed');
    });

    it('should fail to remove non-existent favorite', async () => {
      await Favorite.deleteMany({});
      const res = await request(app).delete(`/api/v1/favorites/${productId}`);
      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error', 'Favorite not found');
    });
  });

  describe('GET /api/v1/favorites', () => {
    beforeEach(async () => {
      const category = await new Category(categoryData).save();
      productData.categoryId = category._id;
      const product = await new Product(productData).save();
      favoriteData.productId = product._id;
      await new Favorite(favoriteData).save();
    });

    it('should get user favorites', async () => {
      const res = await request(app).get('/api/v1/favorites?page=1&limit=10');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].productId.title).toBe('T-Shirt');
    });
  });
});