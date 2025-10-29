const logger = require('../utils/logger');
const amqp = require('amqp-connection-manager');
const { getDailyReport, getInventorySummary, getAlertSummary } = require('../controllers/reportController'); // Integrate our reports

let channelWrapper = null;

// Initialize RabbitMQ connection
const initializeRabbitMQ = async () => {
  try {
    const connection = amqp.connect(['amqp://invexis:invexispass@rabbitmq:5672']);
    channelWrapper = connection.createChannel({
      json: true,
      setup: async channel => {
        await channel.assertQueue('report-queue', { durable: true });
        channel.consume('report-queue', async (msg) => {
          try {
            const { type, companyId } = JSON.parse(msg.content.toString());
            let report;
            switch (type) {
              case 'daily':
                report = await getDailyReport({ user: { companyId } }); // Mock req
                break;
              case 'inventory_summary':
                report = await getInventorySummary({ user: { companyId } });
                break;
              case 'alert_summary':
                report = await getAlertSummary({ user: { companyId } });
                break;
              // Add more from reportController
              default:
                throw new Error('Unknown report type');
            }
            // e.g., save to DB or email
            logger.info(`Report ${type} generated for ${companyId}: ${JSON.stringify(report)}`);
            channel.ack(msg);
          } catch (error) {
            logger.error('Error processing report queue: %s', error.message);
            channel.nack(msg, false, true); // Requeue on failure
          }
        }, { noAck: false });
        logger.info('RabbitMQ channel initialized for report queue');
      }
    });
    await channelWrapper.waitForConnect();
    logger.info('RabbitMQ connection established');
  } catch (error) {
    logger.error('Failed to initialize RabbitMQ: %s', error.message);
  }
};

const scheduleDailyReport = async (companyId) => {
  try {
    if (!channelWrapper) await initializeRabbitMQ();
    await channelWrapper.sendToQueue('report-queue', { type: 'daily', companyId });
    logger.info('Daily report task queued');
  } catch (error) {
    logger.error('Error in daily report scheduler: %s', error.message);
    throw error;
  }
};

const scheduleInventorySummary = async (companyId) => {
  try {
    if (!channelWrapper) await initializeRabbitMQ();
    await channelWrapper.sendToQueue('report-queue', { type: 'inventory_summary', companyId });
    logger.info('Inventory summary report task queued');
  } catch (error) {
    logger.error('Error in inventory summary scheduler: %s', error.message);
    throw error;
  }
};

// Add more schedulers as needed, e.g., weeklyAlertSummary

module.exports = { scheduleDailyReport, scheduleInventorySummary, initializeRabbitMQ };