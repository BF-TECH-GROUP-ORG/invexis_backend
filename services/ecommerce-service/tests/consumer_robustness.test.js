const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const FailedEvent = require('../src/models/FailedEvent.models');
const registerConsumers = require('../src/utils/events/registerConsumer');

// Mock rabbitmq
jest.mock('/app/shared/rabbitmq', () => ({
    subscribe: jest.fn((config, callback) => {
        // Expose the callback for testing
        config._callback = callback;
        return Promise.resolve();
    })
}));

const { subscribe } = require('/app/shared/rabbitmq');

describe('Consumer Robustness', () => {
    let mongoServer;

    beforeAll(async () => {
        mongoServer = await MongoMemoryServer.create();
        await mongoose.connect(mongoServer.getUri());
    });

    afterAll(async () => {
        await mongoose.disconnect();
        await mongoServer.stop();
    });

    afterEach(async () => {
        await FailedEvent.deleteMany({});
        jest.clearAllMocks();
    });

    test('should retry on failure and eventually succeed', async () => {
        const handler = jest.fn()
            .mockRejectedValueOnce(new Error('Fail 1'))
            .mockRejectedValueOnce(new Error('Fail 2'))
            .mockResolvedValueOnce('Success');

        const consumers = [{
            name: 'TestConsumer',
            queue: 'test.queue',
            exchange: 'test.exchange',
            pattern: 'test.*',
            handler: handler
        }];

        await registerConsumers(consumers);

        // Get the registered callback
        const callback = subscribe.mock.calls[0][1];

        await callback({ data: 'test' }, 'test.key');

        expect(handler).toHaveBeenCalledTimes(3);

        const failedEvents = await FailedEvent.find();
        expect(failedEvents.length).toBe(0);
    });

    test('should save to FailedEvent after max retries', async () => {
        const handler = jest.fn().mockRejectedValue(new Error('Persistent Fail'));

        const consumers = [{
            name: 'TestConsumer',
            queue: 'test.queue',
            exchange: 'test.exchange',
            pattern: 'test.*',
            handler: handler
        }];

        await registerConsumers(consumers);

        const callback = subscribe.mock.calls[0][1];

        await callback({ data: 'test' }, 'test.key');

        expect(handler).toHaveBeenCalledTimes(3); // Max retries

        const failedEvents = await FailedEvent.find();
        expect(failedEvents.length).toBe(1);
        expect(failedEvents[0].error).toBe('Persistent Fail');
        expect(failedEvents[0].consumerName).toBe('TestConsumer');
    });
});
