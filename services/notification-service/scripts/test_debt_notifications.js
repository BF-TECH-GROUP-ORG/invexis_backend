const amqp = require('amqplib');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://root:invexispass@localhost:5672';
const EXCHANGE = 'events_topic';

const realIds = {
    companyId: "46e5d562-34f2-4892-a83a-c9cf55b60006",
    shopId: "39cf5aad-6a0f-4be8-90ba-675930d4b927",
    companyName: "Invexis Ltd",
    shopName: "Main Store - Kigali"
};

const events = [
    {
        type: 'debt.created',
        routingKey: 'debt.created',
        data: {
            debtId: `DEBT-TEST-${Date.now()}`,
            customerId: "cust-123",
            customerName: "Jean Valjean",
            customerPhone: "+250780000000",
            companyId: realIds.companyId,
            companyName: realIds.companyName,
            shopId: realIds.shopId,
            shopName: realIds.shopName,
            amount: 50000,
            balance: 50000,
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            performedByName: "Alice Admin",
            items: "Bulk Stock Purchase"
        }
    },
    {
        type: 'debt.payment.received',
        routingKey: 'debt.payment.received',
        data: {
            debtId: "DEBT-TEST-CONST",
            paymentId: `PAY-${Date.now()}`,
            amount: 15000,
            remainingBalance: 35000,
            companyId: realIds.companyId,
            companyName: realIds.companyName,
            shopId: realIds.shopId,
            shopName: realIds.shopName,
            customerName: "Jean Valjean",
            customerPhone: "+250780000000",
            paymentMethod: "Mobile Money",
            paidAt: new Date().toISOString()
        }
    },
    {
        type: 'debt.settled',
        routingKey: 'debt.settled',
        data: {
            debtId: "DEBT-TEST-CONST",
            companyId: realIds.companyId,
            companyName: realIds.companyName,
            shopId: realIds.shopId,
            shopName: realIds.shopName,
            customerName: "Jean Valjean",
            customerPhone: "+250780000000",
            totalAmount: 50000,
            settledAt: new Date().toISOString()
        }
    },
    {
        type: 'debt.overdue',
        routingKey: 'debt.overdue',
        data: {
            debtId: `DEBT-OVERDUE-${Date.now()}`,
            companyId: realIds.companyId,
            companyName: realIds.companyName,
            shopId: realIds.shopId,
            shopName: realIds.shopName,
            customerName: "Jean Valjean",
            customerPhone: "+250780000000",
            balance: 20000,
            overdueDays: 5,
            dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
        }
    }
];

async function runTest() {
    console.log('🧪 Testing debt notifications...');
    let connection;
    try {
        connection = await amqp.connect(RABBITMQ_URL);
        const channel = await connection.createChannel();
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });

        for (const event of events) {
            const payload = {
                id: `test-${event.type}-${Date.now()}`,
                source: 'test-script',
                type: event.type,
                data: event.data,
                emittedAt: new Date().toISOString()
            };

            console.log(`\n🧾 Test: ${event.type}`);
            console.log('──────────────────────────────────────────────────');
            console.log(JSON.stringify(payload, null, 2));

            channel.publish(EXCHANGE, event.routingKey, Buffer.from(JSON.stringify(payload)));
            console.log(`✅ ${event.type} event published`);

            // Wait a bit between events
            await new Promise(resolve => setTimeout(resolve, 1500));
        }

        console.log('\n✅ All debt events published successfully!');

        console.log('\n🔍 Expected behavior:');
        console.log('  1. Notification-service receives events');
        console.log('  2. Routes to debtEvent.handler');
        console.log('  3. Dispatches Push/In-App to Staff (company_admin, worker)');
        console.log('  4. Dispatches SMS to Customer (+250780000000)');

        setTimeout(() => {
            connection.close();
            process.exit(0);
        }, 2000);

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

runTest();
