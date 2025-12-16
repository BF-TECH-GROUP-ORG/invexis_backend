const amqp = require('amqplib');

let connection = null;
let channel = null;

/**
 * Connect to RabbitMQ with retry logic
 */
const connectRabbitMQ = async () => {
  const maxRetries = parseInt(process.env.RABBITMQ_RETRIES) || 5;
  const retryDelay = parseInt(process.env.RABBITMQ_RETRY_DELAY) || 5000;
  const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://invexis:invexispass@rabbitmq:5672';

  for (let i = 0; i < maxRetries; i++) {
    try {
      connection = await amqp.connect(rabbitmqUrl);
      channel = await connection.createChannel();

      // Assert queues for company service
      await channel.assertQueue('company_events', { durable: true });
      await channel.assertQueue('auth_events', { durable: true });
      await channel.assertQueue('payment_events', { durable: true });

      console.log('✅ Connected to RabbitMQ');

      // Handle connection errors
      connection.on('error', (err) => {
        console.error('RabbitMQ connection error:', err);
      });

      connection.on('close', () => {
        console.warn('RabbitMQ connection closed. Reconnecting...');
        setTimeout(connectRabbitMQ, retryDelay);
      });

      return channel;
    } catch (error) {
      console.error(`RabbitMQ connection failed. Retry ${i + 1}/${maxRetries}`, error.message);
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  console.error('❌ Could not connect to RabbitMQ after multiple attempts');
  // Don't exit process, allow service to run without messaging
  return null;
};

/**
 * Close RabbitMQ connection gracefully
 */
const closeRabbitMQ = async () => {
  try {
    if (channel) await channel.close();
    if (connection) await connection.close();
    console.log('RabbitMQ connection closed');
  } catch (error) {
    console.error('Error closing RabbitMQ connection:', error);
  }
};

/**
 * Get the current channel
 */
const getChannel = () => channel;

module.exports = {
  connectRabbitMQ,
  closeRabbitMQ,
  getChannel,
};

