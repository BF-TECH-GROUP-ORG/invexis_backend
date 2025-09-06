const { connectRabbitMQ } = require("../src/config/rabbitmq");

describe("RabbitMQ Service", () => {
    let channel, connection;

    beforeAll(async () => {
        const setup = await connectRabbitMQ();
        connection = setup.connection;
        channel = setup.channel;
    });

    afterAll(async () => {
        if (channel) await channel.close();
        if (connection) await connection.close();
    });

    test("should publish and consume a message", async () => {
        const queue = "test.queue";
        const testMessage = { id: "123", text: "Hello RabbitMQ" };

        await channel.assertQueue(queue, { durable: false });

        // Publish
        await channel.sendToQueue(queue, Buffer.from(JSON.stringify(testMessage)));

        // Consume
        const received = await new Promise((resolve) => {
            channel.consume(
                queue,
                (msg) => {
                    if (msg !== null) {
                        channel.ack(msg);
                        resolve(JSON.parse(msg.content.toString()));
                    }
                },
                { noAck: false }
            );
        });

        expect(received).toEqual(testMessage);
    });
});
