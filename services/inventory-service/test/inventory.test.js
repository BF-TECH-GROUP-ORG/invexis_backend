const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');

const { setupTestDB, teardownTestDB, clearDatabase } = require('./helpers');

// Models
const Category = require('../src/models/Category');
const Product = require('../src/models/Product');
const ProductStock = require('../src/models/ProductStock');
const StockChange = require('../src/models/StockChange');

// Routes (mount real router)
const router = require('../src/routes/index');

let app;

beforeAll(async () => {
  await setupTestDB();
  app = express();
  app.use(express.json());
  app.use('/inventory', router);
});

afterAll(async () => {
  await teardownTestDB();
});

beforeEach(async () => {
  await clearDatabase();
});

describe('Inventory Service integration', () => {
  test('Create category L1 -> L2 -> L3', async () => {
    // Create L1
    const l1 = await request(app).post('/inventory/v1/categories').send({ name: 'Electronics', level: 1 });
    expect(l1.statusCode).toBe(201);

    // Create L2
    const l2 = await request(app).post('/inventory/v1/categories').send({ name: "Phones & Tablets", level: 2, parentCategory: l1.body.data._id });
    expect(l2.statusCode).toBe(201);

    // Create L3 (requires companyId)
    const l3 = await request(app).post('/inventory/v1/categories').send({ name: 'Smartphones', level: 3, parentCategory: l2.body.data._id, companyId: 'COMPANY_TEST' });
    expect(l3.statusCode).toBe(201);
    expect(l3.body.data.level).toBe(3);
  });

  test('Create product persists ProductStock and StockChange using inventory.quantity', async () => {
    // Setup categories
    const l1 = await request(app).post('/inventory/v1/categories').send({ name: 'Electronics', level: 1 });
    const l2 = await request(app).post('/inventory/v1/categories').send({ name: "Phones & Tablets", level: 2, parentCategory: l1.body.data._id });
    const l3 = await request(app).post('/inventory/v1/categories').send({ name: 'Smartphones', level: 3, parentCategory: l2.body.data._id, companyId: 'COMPANY_TEST' });

    const payload = {
      companyId: 'COMPANY_TEST',
      shopId: 'SHOP_TEST',
      name: 'XPhone Test 1',
      description: 'Test phone',
      brand: 'XPhone',
      categoryId: l3.body.data._id,
      pricing: { basePrice: 499.99 },
      images: [{ url: 'https://example.com/img1.jpg', alt: 'img1' }],
      inventory: { trackQuantity: true, quantity: 150, lowStockThreshold: 10, allowBackorder: false }
    };

    const res = await request(app).post('/inventory/v1/products').send(payload);
    expect(res.statusCode).toBe(201);

    // Check ProductStock
    const productId = res.body.data._id;
    const stock = await ProductStock.findOne({ productId }).lean();
    expect(stock).toBeTruthy();
    expect(stock.quantity).toBe(150);

    // Check StockChange
    const changes = await StockChange.find({ productId }).lean();
    expect(changes.length).toBeGreaterThanOrEqual(1);
    const initial = changes.find(c => c.reason && c.reason.includes('Initial stock')) || changes[0];
    expect(initial.qty).toBeGreaterThan(0);
    expect(initial.new).toBeGreaterThanOrEqual(initial.qty);
  });

  test('Allow duplicate product names with different specs', async () => {
    const l1 = await request(app).post('/inventory/v1/categories').send({ name: 'Electronics', level: 1 });
    const l2 = await request(app).post('/inventory/v1/categories').send({ name: "Phones & Tablets", level: 2, parentCategory: l1.body.data._id });
    const l3 = await request(app).post('/inventory/v1/categories').send({ name: 'Smartphones', level: 3, parentCategory: l2.body.data._id, companyId: 'COMPANY_TEST' });

    const base = {
      companyId: 'COMPANY_TEST',
      shopId: 'SHOP_TEST',
      name: 'Common Name',
      description: 'desc',
      brand: 'Brand',
      categoryId: l3.body.data._id,
      pricing: { basePrice: 100 }
    };

    const a = Object.assign({}, base, { specs: [{ name: 'model', value: 'A1' }] });
    const b = Object.assign({}, base, { specs: [{ name: 'model', value: 'B2' }] });

    const r1 = await request(app).post('/inventory/v1/products').send(a);
    expect(r1.statusCode).toBe(201);
    const r2 = await request(app).post('/inventory/v1/products').send(b);
    expect(r2.statusCode).toBe(201);

    const products = await Product.find({ name: 'Common Name' }).lean();
    expect(products.length).toBe(2);
  });

  test('Reject product with >10 images', async () => {
    const l1 = await request(app).post('/inventory/v1/categories').send({ name: 'Electronics', level: 1 });
    const l2 = await request(app).post('/inventory/v1/categories').send({ name: "Phones & Tablets", level: 2, parentCategory: l1.body.data._id });
    const l3 = await request(app).post('/inventory/v1/categories').send({ name: 'Smartphones', level: 3, parentCategory: l2.body.data._id, companyId: 'COMPANY_TEST' });

    const payload = {
      companyId: 'COMPANY_TEST',
      shopId: 'SHOP_TEST',
      name: 'Many Images',
      description: 'desc',
      brand: 'Brand',
      categoryId: l3.body.data._id,
      pricing: { basePrice: 10 },
      images: new Array(11).fill(0).map((_, i) => ({ url: `https://img/${i}.jpg`, alt: `img${i}` }))
    };

    const res = await request(app).post('/inventory/v1/products').send(payload);
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/Cannot exceed 10 images/);
  });

  test('Reject product when parent L2 is inactive', async () => {
    const l1 = await request(app).post('/inventory/v1/categories').send({ name: 'Electronics', level: 1 });
    const l2resp = await request(app).post('/inventory/v1/categories').send({ name: "Phones & Tablets", level: 2, parentCategory: l1.body.data._id });
    const l2id = l2resp.body.data._id;
    // deactivate L2
    await Category.findByIdAndUpdate(l2id, { isActive: false });
    const l3 = await request(app).post('/inventory/v1/categories').send({ name: 'Smartphones', level: 3, parentCategory: l2id, companyId: 'COMPANY_TEST' });
    // L3 created but parent is inactive — product creation should fail

    const payload = {
      companyId: 'COMPANY_TEST',
      shopId: 'SHOP_TEST',
      name: 'Phone Inactive Parent',
      description: 'desc',
      brand: 'Brand',
      categoryId: l3.body.data._id,
      pricing: { basePrice: 10 }
    };

    const res = await request(app).post('/inventory/v1/products').send(payload);
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/Parent L2 category is inactive/);
  });
});
