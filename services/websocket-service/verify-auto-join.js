const { io } = require('socket.io-client');
const jwt = require('jsonwebtoken');
const rabbitmq = require('/app/shared/rabbitmq');

const SECRET = 'sdjnjkdjafd8a79d7fa76yuadsjbjahsgtd76y3498hnjf//dkjsfa';
const companyId = '46e5d562-34f2-4892-a83a-c9cf55b60006';
const userId = 'user-123-' + Date.now();

// 1. Generate JWT with role and departments
const token = jwt.sign({
    sub: userId,
    userId: userId,
    companyId: companyId,
    role: 'worker',
    assignedDepartments: ['sales']
}, SECRET, {
    issuer: 'invexis-auth',
    audience: 'invexis-apps'
});

async function runTest() {
    console.log('🔗 Connecting to WebSocket Service...');
    const socket = io('http://localhost:9002', {
        auth: { token }
    });

    socket.on('connect', () => {
        console.log('✅ Connected as', userId);

        // After connecting, we'll publish a notification to the role room
        setTimeout(async () => {
            console.log('🚀 Publishing notification to role room: company:' + companyId + ':role:worker');
            await rabbitmq.connect();
            await rabbitmq.publish(rabbitmq.exchanges.topic, 'notification.broadcast', {
                type: 'notification.broadcast',
                rooms: [`company:${companyId}:role:worker`],
                data: {
                    title: 'ROLE BROADCAST',
                    body: 'This should reach all workers in this company'
                }
            });
        }, 1000);
    });

    socket.on('notification', (data) => {
        console.log('🎁 RECEIVED NOTIFICATION:', data.title);
        if (data.title === 'ROLE BROADCAST') {
            console.log('🏆 SUCCESS: Auto-join and Role-based delivery verified!');
            process.exit(0);
        }
    });

    socket.on('connect_error', (err) => {
        console.error('❌ Connection error:', err.message);
        process.exit(1);
    });

    // Timeout after 10 seconds
    setTimeout(() => {
        console.error('❌ Timeout: Notification not received');
        process.exit(1);
    }, 10000);
}

runTest().catch(err => {
    console.error(err);
    process.exit(1);
});
