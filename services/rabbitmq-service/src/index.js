const { setupQueues } = require("./queues");
const { orderConsumer } = require("./consumers/orderConsumer");

async function start() {
    await setupQueues();
    // Start consumers
    await orderConsumer();

    console.log("🐇 RabbitMQ Service is running...");
}

start();
