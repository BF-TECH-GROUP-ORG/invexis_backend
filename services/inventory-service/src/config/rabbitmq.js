const amqp = require('amqplib');
const { logger } = require('../utils/logger');

let connection = null;
let channel = null;

const connectRabbitMQ = async () => {
  try {
    connection = await amqp.connect(process.env.RABBITMQ_URL);
    channel = await connection.createChannel();
    await channel.assertQueue('product.events', { durable: true });
    await channel.assertQueue('sales.events', { durable: true });
    logger.info('Connected to RabbitMQ');
  } catch (error) {
    logger.error('RabbitMQ connection failed:', error);
    setTimeout(connectRabbitMQ, 5000);
  }
};

const closeRabbitMQ = async () => {
  if (channel) await channel.close();
  if (connection) await connection.close();
  logger.info('RabbitMQ connection closed');
};

const getChannel = () => channel;

module.exports = { connectRabbitMQ, closeRabbitMQ, getChannel };