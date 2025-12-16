// Mock RabbitMQ for testing
const mockRabbitMQ = {
    publish: jest.fn().mockResolvedValue(true),
    subscribe: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    connect: jest.fn().mockResolvedValue(undefined),

    exchanges: {
        topic: 'test.topic.exchange',
        direct: 'test.direct.exchange',
        fanout: 'test.fanout.exchange'
    },

    queues: {
        orders: 'test.orders.queue',
        notifications: 'test.notifications.queue',
        analytics: 'test.analytics.queue'
    }
};

module.exports = mockRabbitMQ;
