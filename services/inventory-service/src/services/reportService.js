const logger = require('../utils/logger');
const amqp = require('amqp-connection-manager');

let channelWrapper = null;

// Initialize RabbitMQ connection
const initializeRabbitMQ = async () => {
  try {
    const connection = amqp.connect(['amqp://invexis:invexispass@rabbitmq:5672']);
    channelWrapper = connection.createChannel({
      json: true,
      setup: async channel => {
        await channel.assertQueue('report-queue', { durable: true });
        logger.info('RabbitMQ channel initialized for report queue');
      }
    });
    await channelWrapper.waitForConnect();
    logger.info('RabbitMQ connection established');
  } catch (error) {
    logger.error('Failed to initialize RabbitMQ: %s', error.message);
    // Continue without RabbitMQ to avoid blocking server startup
  }
};

const scheduleDailyReport = async () => {
  try {
    logger.info('Daily report scheduler started');
    await initializeRabbitMQ();
    // Placeholder for report scheduling logic
    // Example: await DailyReport.create({ ... });
    if (channelWrapper) {
      await channelWrapper.sendToQueue('report-queue', { type: 'daily_report', companyId: 'seller123' });
      logger.info('Daily report task queued');
    } else {
      logger.warn('RabbitMQ channel not available, skipping queueing');
    }
  } catch (error) {
    logger.error('Error in daily report scheduler: %s', error.message);
    throw error;
  }
};

module.exports = { scheduleDailyReport };