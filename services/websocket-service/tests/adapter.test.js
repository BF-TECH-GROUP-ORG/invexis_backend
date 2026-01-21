// websocket-service/tests/adapter.test.js
const { initAdapter } = require('../src/config/adapter');
const shared = require('../src/config/shared');

jest.mock('../src/config/shared', () => ({
    redis: {
        duplicate: jest.fn().mockReturnValue({ on: jest.fn() }),
        client: { on: jest.fn() },
        subscriber: { on: jest.fn() },
    },
}));

jest.mock('@socket.io/redis-adapter', () => ({
    createAdapter: jest.fn().mockReturnValue('mock-adapter'),
}));

describe('Redis Adapter Initialization', () => {
    let mockIo;

    beforeEach(() => {
        mockIo = {
            adapter: jest.fn(),
        };
        jest.clearAllMocks();
    });

    it('should initialize adapter using duplicate() if available', () => {
        initAdapter(mockIo);
        expect(shared.redis.duplicate).toHaveBeenCalledTimes(2);
        expect(mockIo.adapter).toHaveBeenCalledWith('mock-adapter');
    });

    it('should fallback to client/subscriber if duplicate() is missing', () => {
        const originalDuplicate = shared.redis.duplicate;
        delete shared.redis.duplicate;

        initAdapter(mockIo);

        expect(mockIo.adapter).toHaveBeenCalledWith('mock-adapter');

        shared.redis.duplicate = originalDuplicate;
    });

    it('should skip initialization if redis is missing', () => {
        const originalRedis = shared.redis;
        // We can't delete from module import, but we can set it to null if the module allows or mock it
        jest.mock('../src/config/shared', () => ({ redis: null }), { virtual: true });

        // Actually simpler to just mock shared.redis to null in this test case
        const sharedWithNull = require('../src/config/shared');
        const original = sharedWithNull.redis;
        sharedWithNull.redis = null;

        initAdapter(mockIo);
        expect(mockIo.adapter).not.toHaveBeenCalled();

        sharedWithNull.redis = original;
    });
});
