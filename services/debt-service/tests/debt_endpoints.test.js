const request = require('supertest');
const app = require('../src/app');

describe('Debt Endpoints', () => {
    let companyId, shopId, customerId, debtId, repaymentId, hashedCustomerId;

    it('should seed all models', async () => {
        const res = await request(app).post('/debt/seed').send();
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        companyId = res.body.companyId;
        shopId = res.body.shopId;
        customerId = res.body.customerId;
        hashedCustomerId = res.body.hashedCustomerId;
    });

    it('should create a new debt', async () => {
        const res = await request(app)
            .post('/debt/create')
            .send({
                companyId, shopId,
                customer: { id: customerId, name: 'Test Customer', phone: '0700111222' },
                hashedCustomerId,
                salesId: shopId, salesStaffId: customerId,
                createdBy: { id: customerId, name: 'Tester' },
                items: [{ itemId: shopId, itemName: 'Test Product', quantity: 1, unitPrice: 100, totalPrice: 100 }],
                totalAmount: 100, amountPaidNow: 0, balance: 100,
                status: 'UNPAID', dueDate: new Date(), shareLevel: 'FULL'
            });
        expect(res.statusCode).toBe(201);
        expect(res.body.debt).toBeDefined();
        debtId = res.body.debt._id;
    });

    it('should record a repayment', async () => {
        const res = await request(app)
            .post('/debt/repayment')
            .send({
                companyId, shopId, debtId,
                customer: { id: customerId, name: 'Test Customer', phone: '0700111222' },
                paymentId: shopId, amountPaid: 50, paymentMethod: 'CASH', paymentReference: 'TEST-REF-2',
                createdBy: { id: customerId, name: 'Repayer' }
            });
        expect(res.statusCode).toBe(201);
        expect(res.body.repayment).toBeDefined();
        repaymentId = res.body.repayment._id;
    });

    it('should mark debt as paid', async () => {
        const res = await request(app)
            .post(`/debt/${debtId}/mark-paid`)
            .send({ companyId });
        expect(res.statusCode).toBe(200);
        expect(res.body.debt.status).toBe('PAID');
    });

    it('should cancel a debt', async () => {
        const res = await request(app)
            .post(`/debt/${debtId}/cancel`)
            .send({ companyId, reason: 'test-cancel' });
        expect(res.statusCode).toBe(200);
        expect(res.body.debt.status).toBe('CANCELLED');
    });

    it('should get all debts', async () => {
        const res = await request(app)
            .get('/debt/all');
        expect(res.statusCode).toBe(200);
        expect(res.body.items).toBeDefined();
    });

    it('should get company debts', async () => {
        const res = await request(app)
            .get(`/debt/company/${companyId}/debts`);
        expect(res.statusCode).toBe(200);
        expect(res.body.items).toBeDefined();
    });

    it('should get shop debts', async () => {
        const res = await request(app)
            .get(`/debt/shop/${shopId}/debts`)
            .set('x-company-id', companyId);
        expect(res.statusCode).toBe(200);
        expect(res.body.items).toBeDefined();
    });

    it('should get customer debts', async () => {
        const res = await request(app)
            .get(`/debt/customer/${customerId}/debts`);
        expect(res.statusCode).toBe(200);
        expect(res.body.items).toBeDefined();
    });

    it('should get paid debts for company/shop/customer', async () => {
        const res1 = await request(app).get(`/debt/company/${companyId}/debts/paid`);
        const res2 = await request(app).get(`/debt/shop/${shopId}/debts/paid`).set('x-company-id', companyId);
        const res3 = await request(app).get(`/debt/customer/${customerId}/debts/paid`);
        expect(res1.statusCode).toBe(200);
        expect(res2.statusCode).toBe(200);
        expect(res3.statusCode).toBe(200);
    });

    it('should get partially-paid and unpaid debts for company/shop/customer', async () => {
        const res1 = await request(app).get(`/debt/company/${companyId}/debts/partially-paid`);
        const res2 = await request(app).get(`/debt/company/${companyId}/debts/unpaid`);
        const res3 = await request(app).get(`/debt/shop/${shopId}/debts/partially-paid`).set('x-company-id', companyId);
        const res4 = await request(app).get(`/debt/shop/${shopId}/debts/unpaid`).set('x-company-id', companyId);
        const res5 = await request(app).get(`/debt/customer/${customerId}/debts/partially-paid`);
        const res6 = await request(app).get(`/debt/customer/${customerId}/debts/unpaid`);
        expect(res1.statusCode).toBe(200);
        expect(res2.statusCode).toBe(200);
        expect(res3.statusCode).toBe(200);
        expect(res4.statusCode).toBe(200);
        expect(res5.statusCode).toBe(200);
        expect(res6.statusCode).toBe(200);
    });

    it('should get debt details', async () => {
        const res = await request(app)
            .get(`/debt/${companyId}/debt/${debtId}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.debt).toBeDefined();
    });

    it('should get cross-company customer debts', async () => {
        const res = await request(app)
            .get(`/debt/customer/hashed/${hashedCustomerId}/debts`)
            .set('x-company-id', companyId);
        expect(res.statusCode).toBe(200);
        expect(res.body.debts).toBeDefined();
    });

    it('should perform internal lookup', async () => {
        const res = await request(app)
            .post('/debt/internal/lookup')
            .send({ hashedCustomerId })
            .set('x-company-id', companyId);
        expect(res.statusCode).toBe(200);
        expect(res.body.hashedCustomerId).toBe(hashedCustomerId);
    });
});
