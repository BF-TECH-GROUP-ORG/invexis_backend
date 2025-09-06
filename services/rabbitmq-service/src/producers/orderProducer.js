const { publish } = require("../services/publisher");
const { EXCHANGES } = require("../queues");

async function orderCreated(order) {
    await publish(EXCHANGES.ORDER, {
        type: "order.created",
        data: order,
        timestamp: new Date(),
    });
}

module.exports = { orderCreated };
