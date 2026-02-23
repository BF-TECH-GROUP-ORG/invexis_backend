const amqp = require('amqplib');
const { v4: uuidv4 } = require('uuid');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://root:invexispass@localhost:5672';
const EXCHANGE = 'events_topic';

const companyId = '46e5d562-34f2-4892-a83a-c9cf55b60006';
const companyName = 'Invexis Ltd';

async function publishEvent(channel, type, data) {
    const event = {
        id: uuidv4(),
        source: 'test-script',
        type,
        data,
        emittedAt: new Date().toISOString()
    };

    console.log(`📡 Publishing ${type}...`);
    channel.publish(EXCHANGE, type, Buffer.from(JSON.stringify(event)));
}

async function runTest() {
    let connection;
    try {
        connection = await amqp.connect(RABBITMQ_URL);
        const channel = await connection.createChannel();
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });

        console.log('🧪 Testing Company CRUD notifications...\n');

        // 1. Company Updated
        await publishEvent(channel, 'company.updated', {
            companyId,
            name: companyName,
            updatedFields: ['address', 'phone'],
            performedByName: 'Alice Admin'
        });

        await new Promise(r => setTimeout(r, 1000));

        // 2. Company Status Changed
        await publishEvent(channel, 'company.status.changed', {
            companyId,
            name: companyName,
            status: 'active',
            previousStatus: 'pending',
            performedByName: 'System'
        });

        await new Promise(r => setTimeout(r, 1000));

        // 3. Company Suspended
        await publishEvent(channel, 'company.suspended', {
            companyId,
            name: companyName,
            reason: 'Missing documentation',
            performedByName: 'Super User'
        });

        await new Promise(r => setTimeout(r, 1000));

        // 4. Company Deleted
        await publishEvent(channel, 'company.deleted', {
            companyId,
            name: companyName,
            reason: 'Account closed by user',
            performedByName: 'Super User'
        });

        console.log('\n✅ All Company CRUD events published successfully!');

        await new Promise(r => setTimeout(r, 2000));
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        if (connection) await connection.close();
    }
}

runTest();
