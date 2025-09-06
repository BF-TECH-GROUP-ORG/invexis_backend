const { connectRabbitMQ } = require("../config/rabbitmq");

async function publish(exchange, message) {
    const channel = await connectRabbitMQ();
    channel.publish(exchange, "", Buffer.from(JSON.stringify(message)), {
        persistent: true,
    });
    console.log(`📤 Published to ${exchange}:`, message);
}

module.exports = { publish };
