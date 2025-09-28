const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');
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
  await Category.deleteMany({});
});

afterEach(async () => {
  await Category.deleteMany({});
});

const level1Category = {
  name: 'Fashion',
  level: 1,
  description: 'Fashion products',
  slug: 'fashion',
  visibility: 'public',
};

const level2Category = {
  name: 'Fashion',
  subcategory: 'Mens',
  types: ['Clothes', 'Shoes'],
  level: 2,
  description: 'Mens fashion',
  slug: 'fashion-mens',
};

const level3Category = {
  name: 'Fashion',
  subcategory: 'Mens Shirts',
  types: ['T-Shirts', 'Dress Shirts'],
  level: 3,
  description: 'Mens shirts',
  slug: 'fashion-mens-shirts',
};

describe('Category Routes', () => {
  describe('POST /api/v1/categories', () => {
    it('should create a new level 1 category', async () => {
      const res = await request(app)
        .post('/api/v1/categories')
        .send(level1Category);
      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.name).toBe('Fashion');
      expect(res.body.data.level).toBe(1);
      expect(res.body.data.description).toBe('Fashion products');
    });

    it('should create a new level 2 category', async () => {
      const res = await request(app)
        .post('/api/v1/categories')
        .send(level2Category);
      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.subcategory).toBe('Mens');
      expect(res.body.data.types).toEqual(['Clothes', 'Shoes']);
    });

    it('should fail to create duplicate category', async () => {
      await request(app).post('/api/v1/categories').send(level1Category);
      const res = await request(app)
        .post('/api/v1/categories')
        .send(level1Category);
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error', 'Category already exists');
    });

    it('should fail to create level 2 category without subcategory', async () => {
      const res = await request(app)
        .post('/api/v1/categories')
        .send({ name: 'Fashion', level: 2 });
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error', 'Subcategory is required for level 2 categories');
    });
  });

  describe('GET /api/v1/categories/tree', () => {
    beforeEach(async () => {
      await request(app).post('/api/v1/categories').send(level1Category);
      await request(app).post('/api/v1/categories').send(level2Category);
      await request(app).post('/api/v1/categories').send(level3Category);
    });

    it('should get category tree', async () => {
      const res = await request(app).get('/api/v1/categories/tree');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.level1).toHaveLength(1);
      expect(res.body.data.level2).toHaveLength(1);
      expect(res.body.data.level3).toHaveLength(1);
      expect(res.body.data.level1[0].name).toBe('Fashion');
      expect(res.body.data.level2[0].subcategory).toBe('Mens');
      expect(res.body.data.level3[0].types).toContain('T-Shirts');
    });
  });

  describe('PUT /api/v1/categories/:categoryId', () => {
    let categoryId;

    beforeEach(async () => {
      const res = await request(app).post('/api/v1/categories').send(level1Category);
      categoryId = res.body.data._id;
    });

    it('should update a category', async () => {
      const res = await request(app)
        .put(`/api/v1/categories/${categoryId}`)
        .send({ description: 'Updated Fashion Description' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.description).toBe('Updated Fashion Description');
    });

    it('should fail to update non-existent category', async () => {
      const res = await request(app)
        .put('/api/v1/categories/000000000000000000000000')
        .send({ description: 'Invalid' });
      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error', 'Category not found');
    });
  });

  describe('DELETE /api/v1/categories/:categoryId', () => {
    let categoryId;

    beforeEach(async () => {
      const res = await request(app).post('/api/v1/categories').send(level1Category);
      categoryId = res.body.data._id;
    });

    it('should delete a category', async () => {
      const res = await request(app).delete(`/api/v1/categories/${categoryId}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.message).toBe('Category deleted');
    });

    it('should fail to delete non-existent category', async () => {
      const res = await request(app).delete('/api/v1/categories/000000000000000000000000');
      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error', 'Category not found');
    });
  });
});