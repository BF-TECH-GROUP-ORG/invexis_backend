// websocket-service/tests/index.test.js
const request = require('supertest');
const io = require('socket.io-client');

// Mock shared and cluster BEFORE requiring index
jest.mock('../src/config/shared', () => ({
  redis: {
    connect: jest.fn().mockResolvedValue(),
    disconnect: jest.fn().mockResolvedValue(),
    sadd: jest.fn().mockResolvedValue(),
    srem: jest.fn().mockResolvedValue(),
    set: jest.fn().mockResolvedValue(),
    scard: jest.fn().mockResolvedValue(0),
    smembers: jest.fn().mockResolvedValue([]),
    exists: jest.fn().mockResolvedValue(0),
    del: jest.fn().mockResolvedValue(),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(),
    isConnected: true,
  },
  rabbitmq: {
    connect: jest.fn().mockResolvedValue(),
    subscribe: jest.fn(),
    healthCheck: jest.fn().mockResolvedValue(true),
    exchanges: { topic: 'test-exchange', dlx: 'test-dlx' },
  },
  healthCheck: jest.fn().mockResolvedValue({ redis: { status: 'ok' }, rabbitmq: { status: 'ok' } }),
}));

jest.mock('../src/config/adapter', () => ({
  initAdapter: jest.fn()
}));

jest.mock('../src/events/handlers', () => ({
  initializeHandlers: jest.fn(),
  handleJoin: jest.fn((socket) => {
    socket.on('join', (rooms) => {
      socket.emit('joined', { rooms, success: true });
    });
  }),
  handleLeave: jest.fn(),
  handleCustomEvents: jest.fn(),
  cleanup: jest.fn(),
}));

const { app, server, startWorker, shutdown } = require('../src/index');

describe('WebSocket Service', () => {
  let serverPort;

  beforeAll(async () => {
    // Use dynamic port to avoid conflicts
    process.env.PORT = '0';
    await startWorker();
    serverPort = server.address().port;
  });

  afterAll(async () => {
    await new Promise((resolve) => {
      server.close(() => resolve());
    });
  });

  it('should respond to health check', async () => {
    const res = await request(server).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.connectedClients).toBeDefined();
  });

  it('should connect via Socket.IO', (done) => {
    const client = io.connect(`http://localhost:${serverPort}`, {
      auth: { token: 'mock-token' },
      reconnection: false,
      forceNew: true,
      transports: ['websocket'],
    });

    const timeout = setTimeout(() => {
      client.disconnect();
      done(new Error('Connection timeout'));
    }, 5000);

    client.on('connect', () => {
      clearTimeout(timeout);
      expect(client.connected).toBe(true);
      client.emit('join', ['test-room']);
      client.on('joined', (data) => {
        expect(data.success).toBe(true);
        client.disconnect();
        done();
      });
    });

    client.on('error', (err) => {
      clearTimeout(timeout);
      client.disconnect();
      done(err);
    });
  });
});