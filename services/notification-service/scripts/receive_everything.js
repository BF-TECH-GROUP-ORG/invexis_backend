const amqp = require('amqplib');
const { v4: uuidv4 } = require('uuid');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://root:invexispass@localhost:5672';
const EXCHANGE = 'events_topic';

// USER DETAILS FOR DIRECT RECEIPT
const userId = '695e452eaa7d9d91f7fe426c';
const companyId = '46e5d562-34f2-4892-a83a-c9cf55b60006';
const email = 'admin@invexis.com';

async function publishEvent(channel, type, data) {
    const event = {
        id: uuidv4(),
        source: 'receiving-simulation',
        type,
        data: {
            ...data,
            companyId,
            userId, // Often used as affectedUserId or similar
            adminId: userId
        },
        emittedAt: new Date().toISOString()
    };

    console.log(`📡 Publishing ${type}...`);
    channel.publish(EXCHANGE, type, Buffer.from(JSON.stringify(event)));
}

async function runFullSimulation() {
    let connection;
    try {
        connection = await amqp.connect(RABBITMQ_URL);
        const channel = await connection.createChannel();
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });

        console.log('🚀 READY TO RECEIVE ALL NOTIFICATIONS INSTANTLY\n');

        // 1. COMPANY CREATION (Double alert: Welcome + Super Admin)
        await publishEvent(channel, 'company.created', {
            name: 'Invexis Premium Store',
            email,
            phone: '+250788888888',
            fcmToken: 'test-token'
        });
        await new Promise(r => setTimeout(r, 4000));

        // 2. COMPANY UPDATE
        await publishEvent(channel, 'company.updated', {
            name: 'Invexis Global Store',
            updatedFields: ['branding', 'address']
        });
        await new Promise(r => setTimeout(r, 4000));

        // 3. SUBSCRIPTION CREATED
        await publishEvent(channel, 'subscription.created', {
            tier: 'Platinum',
            endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        });
        await new Promise(r => setTimeout(r, 4000));

        // 4. STAFF ASSIGNED (Department Notification)
        await publishEvent(channel, 'department_user.assigned', {
            departmentName: 'Strategic Operations',
            role: 'Director',
            performedByName: 'Platform System'
        });
        await new Promise(r => setTimeout(r, 4000));

        // 5. SUBSCRIPTION RENEWED
        await publishEvent(channel, 'subscription.renewed', {
            tier: 'Platinum Plus',
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        });
        await new Promise(r => setTimeout(r, 4000));

        // 6. PAYMENT FAILED (Critical Alert)
        await publishEvent(channel, 'subscription.payment.failed', {
            amount: 75000,
            reason: 'Security Block (Simulated)',
            paymentId: 'TRX-' + uuidv4().substring(0, 8)
        });
        await new Promise(r => setTimeout(r, 4000));

        // 7. SUBSCRIPTION EXPIRED / SUSPENDED
        await publishEvent(channel, 'subscription.expired', {
            expiredAt: new Date().toISOString()
        });
        await new Promise(r => setTimeout(r, 4000));

        // 8. COMPANY SUSPENDED (Final Critical Alert)
        await publishEvent(channel, 'company.suspended', {
            name: 'Invexis Global Store',
            reason: 'End of Simulation Lifecycle Test'
        });

        console.log('\n✅ ALL NOTIFICATIONS DISPATCHED. Check your In-App notifications now!');

        await new Promise(r => setTimeout(r, 2000));
    } catch (error) {
        console.error('❌ Error during simulation:', error);
    } finally {
        if (connection) await connection.close();
    }
}

runFullSimulation();
