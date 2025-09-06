const { connectRabbitMQ } = require("../config/rabbitmq");

async function subscribe(queue, callback) {
    const channel = await connectRabbitMQ();

    await channel.consume(
        queue,
        async (msg) => {
            if (msg !== null) {
                const content = JSON.parse(msg.content.toString());
                try {
                    await callback(content);
                    channel.ack(msg);
                } catch (error) {
                    console.error("Processing failed:", error);
                    channel.nack(msg, false, true); // requeue
                }
            }
        },
        { noAck: false }
    );

    console.log(`📥 Subscribed to ${queue}`);
}

module.exports = { subscribe };
