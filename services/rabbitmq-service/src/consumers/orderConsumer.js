const { subscribe } = require("../services/subscriber");
const { QUEUES } = require("../queues");

async function orderConsumer() {
    await subscribe(QUEUES.ORDER, async (msg) => {
        console.log("🛒 [Order Consumer] Received:", msg);
        // business logic here (e.g. notify inventory-service)
    });
}

module.exports = { orderConsumer };
