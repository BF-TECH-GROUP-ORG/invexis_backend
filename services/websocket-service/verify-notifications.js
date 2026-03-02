const rabbitmq = require('/app/shared/rabbitmq');

async function triggerTestNotification() {
    await rabbitmq.connect();

    const companyId = '46e5d562-34f2-4892-a83a-c9cf55b60006';

    const payload = {
        type: 'notification.broadcast',
        source: 'verification-script',
        rooms: [`company:${companyId}`],
        data: {
            notificationId: 'test-notif-' + Date.now(),
            title: 'VERIFICATION SUCCESS',
            body: 'Real-time notifications are now working correctly!',
            priority: 'high',
            createdAt: new Date()
        },
        emittedAt: new Date().toISOString()
    };

    console.log('🚀 Publishing test notification to RabbitMQ...');
    await rabbitmq.publish(rabbitmq.exchanges.topic, 'notification.broadcast', payload);

    console.log('✅ Event published. Check websocket-service logs for "Attempting to emit".');

    setTimeout(() => {
        process.exit(0);
    }, 2000);
}

triggerTestNotification().catch(console.error);
