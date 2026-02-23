const amqp = require('amqplib');
const { v4: uuidv4 } = require('uuid');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://root:invexispass@localhost:5672';
const EXCHANGE = 'events_topic';

async function runTest() {
    let connection;
    try {
        connection = await amqp.connect(RABBITMQ_URL);
        const channel = await connection.createChannel();
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });

        const companyId = uuidv4();
        const adminId = '69338c304be5c252132e97a9'; // Example user ID

        const event = {
            id: uuidv4(),
            source: 'test-script',
            type: 'company.created',
            data: {
                companyId,
                name: 'Test Super Admin Co',
                adminId,
                email: 'admin@testco.com',
                phone: '+250700000000',
                fcmToken: 'test-token'
            },
            emittedAt: new Date().toISOString()
        };

        console.log('🧪 Testing Company Creation notifications (Admin + Super Admin)...');
        channel.publish(EXCHANGE, 'company.created', Buffer.from(JSON.stringify(event)));

        console.log('\n✅ company.created event published!');

        await new Promise(r => setTimeout(r, 2000));
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        if (connection) await connection.close();
    }
}

runTest();
