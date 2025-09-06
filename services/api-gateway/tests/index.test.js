const request = require('supertest');
const app = require('../src/index'); // Import your app

describe('API Gateway Tests', () => {
    it('should return a 200 status and message for the root route', async () => {
        const res = await request(app).get('/');
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ message: 'API Gateway is running' });
    });

    it('should enforce rate limiting', async () => {
        // Temporarily override NODE_ENV
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production'; // Set to production to enable rate limiting

        for (let i = 0; i < 101; i++) {
            await request(app).get('/');
        }
        const res = await request(app).get('/');
        expect(res.statusCode).toBe(429);
        expect(res.body.message).toBe('Too many requests, please try again later.');

        // Restore the original NODE_ENV
        process.env.NODE_ENV = originalEnv;
    });

    it('should forward requests to /auth', async () => {
        const res = await request(app).get('/auth');
        expect(res.statusCode).toBe(200); // Assuming the auth service responds with 200
    });

    it('should return 404 for unknown routes', async () => {
        const res = await request(app).get('/unknown');
        expect(res.statusCode).toBe(404);
    });
});