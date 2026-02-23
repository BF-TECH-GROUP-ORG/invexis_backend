require('dotenv').config();
const amqp = require('amqplib');
const { v4: uuidv4 } = require('uuid');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const EXCHANGE = 'events_topic';

async function testStaffNotifications() {
    console.log('🧪 Testing Staff Notifications...');

    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();
    await channel.assertExchange(EXCHANGE, 'topic', { durable: true });

    const companyId = '46e5d562-34f2-4892-a83a-c9cf55b60006'; // Verified Company
    const userId = '654321098765432109876543'; // Valid MongoDB ObjectId format
    const departmentId = '654321098765432109871111';
    const departmentName = 'Sales Floor';

    // 1. Test Assignment
    const assignedEvent = {
        id: uuidv4(),
        type: 'department_user.assigned',
        data: {
            userId,
            departmentId,
            departmentName,
            companyId,
            role: 'worker',
            performedByName: 'Admin Manager'
        },
        emittedAt: new Date().toISOString()
    };

    console.log(`\n👥 Publishing department_user.assigned`);
    channel.publish(EXCHANGE, 'department_user.assigned', Buffer.from(JSON.stringify(assignedEvent)));

    await new Promise(resolve => setTimeout(resolve, 2000));

    // 2. Test Role Change
    const roleEvent = {
        id: uuidv4(),
        type: 'department_user.role_changed',
        data: {
            userId,
            departmentId,
            departmentName,
            companyId,
            role: 'manager',
            performedByName: 'Senior Admin'
        },
        emittedAt: new Date().toISOString()
    };

    console.log(`\n📝 Publishing department_user.role_changed`);
    channel.publish(EXCHANGE, 'department_user.role_changed', Buffer.from(JSON.stringify(roleEvent)));

    await new Promise(resolve => setTimeout(resolve, 2000));

    // 3. Test Removed
    const removedEvent = {
        id: uuidv4(),
        type: 'department_user.removed',
        data: {
            userId,
            departmentId,
            departmentName,
            companyId,
            performedByName: 'HR Dept'
        },
        emittedAt: new Date().toISOString()
    };

    console.log(`\n🗑️ Publishing department_user.removed`);
    channel.publish(EXCHANGE, 'department_user.removed', Buffer.from(JSON.stringify(removedEvent)));

    console.log('\n🏁 Staff events published.');
    setTimeout(() => process.exit(0), 1000);
}

testStaffNotifications().catch(console.error);
