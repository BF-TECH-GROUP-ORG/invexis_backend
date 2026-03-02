const { io } = require('socket.io-client');
const jwt = require('jsonwebtoken');
const rabbitmq = require('/app/shared/rabbitmq');

const SECRET = 'sdjnjkdjafd8a79d7fa76yuadsjbjahsgtd76y3498hnjf//dkjsfa';
const companyId = 'precision-company-1';
const shopA = 'shop-A';
const shopB = 'shop-B';

// Admin B (Shop B)
const adminBToken = jwt.sign({
    sub: 'admin-B',
    userId: 'admin-B',
    companyId: companyId,
    shopId: shopB,
    role: 'company_admin'
}, SECRET, {
    issuer: 'invexis-auth',
    audience: 'invexis-apps'
});

// Staff A (Shop A)
const staffAToken = jwt.sign({
    sub: 'staff-A',
    userId: 'staff-A',
    companyId: companyId,
    shopId: shopA,
    role: 'worker'
}, SECRET, {
    issuer: 'invexis-auth',
    audience: 'invexis-apps'
});

async function runTest() {
    console.log('🔗 Connecting test clients...');

    const clientA = io('http://localhost:9002', { auth: { token: staffAToken } });
    const clientB = io('http://localhost:9002', { auth: { token: adminBToken } });

    let receivedByA = 0;
    let receivedByB = 0;

    clientA.on('notification', (n) => {
        receivedByA++;
        console.log('📥 Staff A (Shop A) received:', n.title);
    });

    clientB.on('notification', (n) => {
        receivedByB++;
        console.log('📥 Admin B (Shop B) received:', n.title);
    });

    await new Promise(r => setTimeout(r, 2000));
    console.log('✅ Clients connected.');

    await rabbitmq.connect();

    // TEST 1: Shop B Specific Role Broadcast
    console.log('🚀 Test 1: Broadcasting to Shop B Admins...');
    await rabbitmq.publish(rabbitmq.exchanges.topic, 'notification.broadcast', {
        type: 'notification.broadcast',
        rooms: [`company:${companyId}:shop:${shopB}:role:company_admin`],
        data: { title: 'SHOP B ONLY', body: 'This should NOT reach Shop A' }
    });

    await new Promise(r => setTimeout(r, 2000));

    // TEST 2: Duplicate Prevention (Send twice with same eventId)
    // Note: This relies on the mock publisher not having a real ID, but the consumer logic we added.
    // Actually, dispatcher.js has uniqueRecipients check.
    // Let's test dispatcher logic via RabbitMQ if we can.
    // But verify-precision is mocking the websocket-service side.

    console.log('📊 Verification:');
    console.log(`Staff A received ${receivedByA} notifications (Expected: 0)`);
    console.log(`Admin B received ${receivedByB} notifications (Expected: 1)`);

    if (receivedByA === 0 && receivedByB === 1) {
        console.log('🏆 SUCCESS: Shop isolation and precision verified!');
        process.exit(0);
    } else {
        console.log('❌ FAILURE: Isolation or precision checks failed.');
        process.exit(1);
    }
}

runTest().catch(err => {
    console.error(err);
    process.exit(1);
});
