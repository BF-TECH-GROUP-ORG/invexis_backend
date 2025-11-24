const request = require('supertest');
const app = require('../src/app');

describe('Analytics and Summary Endpoints', () => {
    let companyId, shopId, customerId, hashedCustomerId;
    beforeAll(async () => {
        const res = await request(app).post('/debt/seed').send();
        companyId = res.body.companyId;
        shopId = res.body.shopId;
        customerId = res.body.customerId;
        hashedCustomerId = res.body.hashedCustomerId;
    });

    it('should get company analytics', async () => {
        const res = await request(app).get(`/debt/analytics/company/${companyId}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.totalOutstanding).toBeDefined();
    });

    it('should get shop analytics', async () => {
        const res = await request(app).get(`/debt/analytics/shop/${shopId}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.totalOutstanding).toBeDefined();
    });

    it('should get customer analytics', async () => {
        const res = await request(app).get(`/debt/analytics/customer/${customerId}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.totalOutstanding).toBeDefined();
    });

    it('should get company aging buckets', async () => {
        const res = await request(app).get(`/debt/analytics/company/${companyId}/aging`);
        expect(res.statusCode).toBe(200);
        expect(res.body).toBeDefined();
    });

    it('should get company summary', async () => {
        const res = await request(app).get(`/debt/summary/company/${companyId}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.summary.companyId).toBe(companyId);
    });

    it('should get shop summary', async () => {
        const res = await request(app).get(`/debt/summary/shop/${shopId}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.summary.shopId).toBe(shopId);
    });

    it('should get customer summary', async () => {
        const res = await request(app).get(`/debt/summary/customer/${customerId}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.summary.customerId).toBe(customerId);
    });

    it('should get cross-company summary', async () => {
        const res = await request(app).get(`/debt/summary/cross-company/${hashedCustomerId}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.summary.hashedCustomerId).toBe(hashedCustomerId);
    });
});
