const amqplib = require("amqplib");

require("dotenv").config();

let connection = null;
let channel = null;

async function connectRabbitMQ() {
    if (connection && channel) return channel;

    const retries = parseInt(process.env.RABBITMQ_RETRIES) || 5;
    const delay = parseInt(process.env.RABBITMQ_RETRY_DELAY) || 5000;

    for (let i = 0; i < retries; i++) {
        try {
            connection = await amqplib.connect(process.env.RABBITMQ_URL);
            channel = await connection.createChannel();
            console.log("Connected to RabbitMQ");
            return channel;
        } catch (error) {
            console.error(`RabbitMQ connection failed. Retry ${i + 1}/${retries}`);
            await new Promise(res => setTimeout(res, delay));
        }
    }

    console.error("Could not connect to RabbitMQ after multiple attempts");
    process.exit(1);
}

module.exports = { connectRabbitMQ };
