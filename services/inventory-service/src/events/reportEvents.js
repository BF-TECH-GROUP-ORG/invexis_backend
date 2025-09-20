const amqp = require('amqplib');
const logger = require('../utils/logger');

let connection = null;
let channel = null;

const connectRabbitMQ = async () => {
  try {
    connection = await amqp.connect(process.env.RABBITMQ_URL);
    channel = await connection.createChannel();
    await channel.assertQueue('salesQueue', { durable: true });
    logger.info('RabbitMQ connected');
  } catch (error) {
    logger.error('RabbitMQ connection error:', error);
    setTimeout(connectRabbitMQ, 5000); // Retry after 5s
  }
};

const consumeSalesEvents = async (callback) => {
  if (!channel) {
    logger.error('RabbitMQ channel not initialized');
    return;
  }
  try {
    await channel.consume('salesQueue', async (msg) => {
      if (msg !== null) {
        const event = JSON.parse(msg.content.toString());
        await callback(event);
        channel.ack(msg);
      }
    });
    logger.info('Consuming sales events');
  } catch (error) {
    logger.error('Error consuming sales events:', error);
  }
};

module.exports = { connectRabbitMQ, consumeSalesEvents };