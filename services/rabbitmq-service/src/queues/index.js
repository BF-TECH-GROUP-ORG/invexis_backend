const { connectRabbitMQ } = require("../config/rabbitmq");

const EXCHANGES = {
    ORDER: "order_exchange",
};

const QUEUES = {
    ORDER: "order_queue",
};

async function setupQueues() {
    const channel = await connectRabbitMQ();

    // Order queue
    await channel.assertExchange(EXCHANGES.ORDER, "direct", { durable: true });
    await channel.assertQueue(QUEUES.ORDER, { durable: true });
    await channel.bindQueue(QUEUES.ORDER, EXCHANGES.ORDER, "");

    console.log("Queues & Exchanges set up");
}

module.exports = { setupQueues, EXCHANGES, QUEUES };
