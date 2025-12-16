const request = require('supertest');
const app = require('../src/app');

describe('Seed and Summary Endpoints', () => {
    let seeded;
    it('should seed all models', async () => {
        const res = await request(app)
            .post('/debt/seed')
            .send();
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.companyId).toBeDefined();
        expect(res.body.shopId).toBeDefined();
        expect(res.body.customerId).toBeDefined();
        expect(res.body.hashedCustomerId).toBeDefined();
        seeded = res.body;
    });

    it('should get company summary', async () => {
        const res = await request(app)
            .get(`/debt/summary/company/${seeded.companyId}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.summary).toBeDefined();
        expect(res.body.summary.companyId).toBe(seeded.companyId);
    });

    it('should get shop summary', async () => {
        const res = await request(app)
            .get(`/debt/summary/shop/${seeded.shopId}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.summary).toBeDefined();
        expect(res.body.summary.shopId).toBe(seeded.shopId);
    });

    it('should get customer summary', async () => {
        const res = await request(app)
            .get(`/debt/summary/customer/${seeded.customerId}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.summary).toBeDefined();
        expect(res.body.summary.customerId).toBe(seeded.customerId);
    });

    it('should get cross-company summary', async () => {
        const res = await request(app)
            .get(`/debt/summary/cross-company/${seeded.hashedCustomerId}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.summary).toBeDefined();
        expect(res.body.summary.hashedCustomerId).toBe(seeded.hashedCustomerId);
    });
});
