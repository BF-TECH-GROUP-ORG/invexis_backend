// tests/app.test.js
const request = require('supertest');
const app = require('../src/index'); // Note: in real, export app from index

describe('Notification Service API', () => {
    it('should respond to health check', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
    });

    it('should dispatch test notification', async () => {
        const res = await request(app)
            .post('/test/send')
            .send({ userId: 'test123', channels: { email: true } });
        expect(res.status).toBe(200);
    });
});