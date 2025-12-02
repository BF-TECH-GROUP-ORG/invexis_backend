module.exports = {
    testEnvironment: 'node',
    testTimeout: 30000,
    moduleNameMapper: {
        '^/app/shared/redis$': '<rootDir>/tests/__mocks__/redis.js',
        '^/app/shared/rabbitmq$': '<rootDir>/tests/__mocks__/rabbitmq.js'
    }
};
