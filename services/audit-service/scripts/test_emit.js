const { connect, publish, exchanges } = require('../shared/rabbitmq');

const run = async () => {
    try {
        console.log('Connecting to RMQ...');
        await connect();

        const event = {
            id: 'test-event-' + Date.now(),
            type: 'test.audit.event',
            source: 'test-script',
            data: {
                message: 'Hello Audit Service',
                value: 42,
                companyId: 'comp_test_123',
                userId: 'user_test_456'
            },
            emittedAt: new Date().toISOString()
        };

        const routingKey = 'test.audit.event';
        await publish(exchanges.topic, routingKey, event);
        console.log('✅ Published test event:', routingKey);

        setTimeout(() => {
            console.log('Exiting...');
            process.exit(0);
        }, 1000);
    } catch (e) {
        console.error('❌ Error:', e);
        process.exit(1);
    }
};

run();
