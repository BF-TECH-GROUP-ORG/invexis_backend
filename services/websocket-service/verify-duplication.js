const io = require('socket.io-client');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_ACCESS_SECRET || 'your-secret-key';
const companyId = '654321';
const shopId = 'shop-123';

const token = jwt.sign({
    sub: 'user-123',
    userId: 'user-123',
    companyId,
    shopId,
    role: 'worker'
}, SECRET, { issuer: 'invexis-auth', audience: 'invexis-apps' });

const socket = io('http://localhost:3005', {
    auth: { token }
});

let notificationsReceived = 0;

socket.on('connect', () => {
    console.log('✅ Connected to WebSocket');

    console.log('🚀 Triggering test: user is in rooms [user:user-123] and [company:654321:shop:shop-123:role:worker]');
    console.log('Expectation: Only ONE notification should be received despite both rooms being targeted.');
});

socket.on('notification', (data) => {
    notificationsReceived++;
    console.log(`📥 Received notification ${notificationsReceived}:`, data.content);
});

setTimeout(() => {
    console.log('\n📊 Results:');
    console.log(`Total notifications: ${notificationsReceived}`);
    if (notificationsReceived === 1) {
        console.log('🏆 SUCCESS: Duplication fixed!');
    } else if (notificationsReceived > 1) {
        console.log('❌ FAILURE: User received duplicates.');
    } else {
        console.log('⚠️ No notifications received. Ensure server is running.');
    }
    process.exit(0);
}, 5000);
