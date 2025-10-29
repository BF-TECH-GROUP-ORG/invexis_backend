// websocket-service/tests/index.test.js (updated for cluster mock)
const request = require('supertest');
const io = require('socket.io-client');
const { app, startWorker } = require('../src/index');
const cluster = require('cluster');

// Mock shared and cluster
jest.mock('../src/config/shared', () => ({
    initShared: jest.fn().mockResolvedValue(),
    redis: { sadd: jest.fn(), srem: jest.fn(), set: jest.fn(), isConnected: true },
    rabbitmq: { connect: jest.fn(), subscribe: jest.fn(), healthCheck: jest.fn().mockResolvedValue(true) },
    healthCheck: jest.fn().mockResolvedValue({ redis: true, rabbitmq: true })
}));

jest.mock('../src/config/adapter', () => ({
    initAdapter: jest.fn()
}));

describe('WebSocket Cluster Service', () => {
    let server;

    beforeAll(async (done) => {
        server = app.listen(0, done);
        await startWorker();
    });

    afterAll((done) => {
        server.close(done);
    });

    it('should respond to health check with cluster info', async () => {
        const res = await request(server).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
        expect(res.body.connectedClients).toBeDefined();
    });

    it('should connect via Socket.IO in cluster mode', (done) => {
        const client = io.connect(`http://localhost:${server.address().port}`, {
            auth: { token: 'mock-token' }
        });

        client.on('connect', () => {
            expect(client.connected).toBe(true);
            client.emit('join', ['test-room']);
            client.on('joined', (data) => {
                expect(data.success).toBe(true);
                client.disconnect();
                done();
            });
        });
    });
});