const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Outbox = require('../src/models/Outbox.models');

// Mock logger
jest.mock('../src/utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
}));

const { processOutbox } = require('../src/workers/outboxDispatcher');

// Mock producer
jest.mock('../src/events/producer', () => ({
    emit: jest.fn()
}));

const { emit } = require('../src/events/producer');

describe('Outbox Service Robustness', () => {
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
        await Outbox.deleteMany({});
        jest.clearAllMocks();
    });

    test('should mark event as sent on success', async () => {
        const event = await Outbox.create({
            type: 'ecommerce.cart.created',
            routingKey: 'ecommerce.cart.created',
            payload: { cartId: '123' }
        });

        emit.mockResolvedValueOnce();

        await processOutbox();

        const updatedEvent = await Outbox.findById(event._id);
        expect(updatedEvent.status).toBe('sent');
        expect(updatedEvent.processedAt).toBeDefined();
        expect(emit).toHaveBeenCalledWith('ecommerce.cart.created', expect.objectContaining({ cartId: '123' }));
    });

    test('should schedule retry on failure', async () => {
        const event = await Outbox.create({
            type: 'ecommerce.cart.created',
            routingKey: 'ecommerce.cart.created',
            payload: { cartId: '123' }
        });

        emit.mockRejectedValueOnce(new Error('RabbitMQ down'));

        await processOutbox();

        const updatedEvent = await Outbox.findById(event._id);
        expect(updatedEvent.status).toBe('failed');
        expect(updatedEvent.attempts).toBe(1);
        expect(updatedEvent.nextRetryAt).toBeDefined();
        expect(updatedEvent.lastError).toBe('RabbitMQ down');
    });

    test('should move to dead letter after max attempts', async () => {
        const event = await Outbox.create({
            type: 'ecommerce.cart.created',
            routingKey: 'ecommerce.cart.created',
            payload: { cartId: '123' },
            attempts: 4,
            status: 'failed',
            nextRetryAt: new Date(Date.now() - 1000) // Ready for retry
        });

        emit.mockRejectedValueOnce(new Error('Persistent failure'));

        await processOutbox();

        const updatedEvent = await Outbox.findById(event._id);
        expect(updatedEvent.status).toBe('dead_letter');
        expect(updatedEvent.lastError).toBe('Persistent failure');
    });

    test('should process retry events when ready', async () => {
        const event = await Outbox.create({
            type: 'ecommerce.cart.created',
            routingKey: 'ecommerce.cart.created',
            payload: { cartId: '123' },
            status: 'failed',
            nextRetryAt: new Date(Date.now() - 1000) // Ready for retry
        });

        emit.mockResolvedValueOnce();

        await processOutbox();

        const updatedEvent = await Outbox.findById(event._id);
        expect(updatedEvent.status).toBe('sent');
    });

    test('should NOT process retry events when NOT ready', async () => {
        const event = await Outbox.create({
            type: 'ecommerce.cart.created',
            routingKey: 'ecommerce.cart.created',
            payload: { cartId: '123' },
            status: 'failed',
            nextRetryAt: new Date(Date.now() + 10000) // Not ready
        });

        await processOutbox();

        const updatedEvent = await Outbox.findById(event._id);
        expect(updatedEvent.status).toBe('failed');
        expect(emit).not.toHaveBeenCalled();
    });
});
