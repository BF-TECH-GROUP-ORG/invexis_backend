const logger = require('../utils/logger');
const rabbitmq = require('/app/shared/rabbitmq.js');
const redis = require('/app/shared/redis.js');
const { getDailyReport, getInventorySummary, getAlertSummary } = require('../controllers/reportController');

// Cache TTLs
const CACHE_TTLS = {
  report: 3600 // 1 hour for report data
};

let channelWrapper = null;

// Caching helpers
async function getCachedReport(type, companyId) {
  const cacheKey = `report:${type}:${companyId}`;
  let reportJson = await redis.get(cacheKey);
  if (reportJson) {
    logger.info(`Cache hit for report ${type} for company ${companyId}`);
    return JSON.parse(reportJson);
  }
  return null;
}

async function cacheReport(type, companyId, report) {
  const cacheKey = `report:${type}:${companyId}`;
  await redis.set(cacheKey, JSON.stringify(report), 'EX', CACHE_TTLS.report);
  logger.info(`Cached report ${type} for company ${companyId}`);
}

async function invalidateReportCache(type, companyId) {
  const cacheKey = `report:${type}:${companyId}`;
  await redis.del(cacheKey);
  logger.info(`Invalidated cache for report ${type} for company ${companyId}`);
}

// Initialize RabbitMQ connection with retry logic
const initializeRabbitMQ = async () => {
  let retries = 5;
  while (retries > 0) {
    try {
      logger.info('Attempting to connect to RabbitMQ...');
      const connection = rabbitmq.connect( {
        reconnectTimeInSeconds: 5
      });

      channelWrapper = connection.createChannel({
        json: true,
        setup: async channel => {
          await channel.assertQueue('report-queue', { durable: true });
          channel.consume('report-queue', async (msg) => {
            try {
              const { type, companyId } = JSON.parse(msg.content.toString());
              logger.info(`Processing report ${type} for company ${companyId}`);

              // Check cache first
              let report = await getCachedReport(type, companyId);
              if (!report) {
                switch (type) {
                  case 'daily':
                    report = await getDailyReport({ user: { companyId } });
                    break;
                  case 'inventory_summary':
                    report = await getInventorySummary({ user: { companyId } });
                    break;
                  case 'alert_summary':
                    report = await getAlertSummary({ user: { companyId } });
                    break;
                  default:
                    throw new Error('Unknown report type');
                }
                await cacheReport(type, companyId, report);
              }

              // e.g., save to DB or email (handled in reportController)
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
      return; // Success - exit retry loop
    } catch (error) {
      logger.error(`RabbitMQ connection attempt failed: ${error.message}`);
      retries--;
      if (retries === 0) {
        logger.error('Maximum RabbitMQ connection retries reached. Exiting...');
        throw new Error('Failed to initialize RabbitMQ');
      }
      logger.info(`Retrying RabbitMQ connection in 5 seconds... (${retries} attempts remaining)`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
};

// Graceful shutdown for RabbitMQ
const shutdownRabbitMQ = async () => {
  if (channelWrapper) {
    try {
      logger.info('Closing RabbitMQ channel...');
      await channelWrapper.close();
      logger.info('RabbitMQ channel closed');
    } catch (error) {
      logger.error(`Error closing RabbitMQ channel: ${error.message}`);
    }
  }
};

// Initialize on module load (optional, depending on your use case)
initializeRabbitMQ().catch(error => {
  logger.error('Failed to initialize RabbitMQ on startup: %s', error.message);
});

// Schedule report functions
const scheduleDailyReport = async (companyId) => {
  try {
    if (!channelWrapper) await initializeRabbitMQ();
    await channelWrapper.sendToQueue('report-queue', { type: 'daily', companyId });
    logger.info(`Daily report task queued for company ${companyId}`);
  } catch (error) {
    logger.error('Error in daily report scheduler: %s', error.message);
    throw error;
  }
};

const scheduleInventorySummary = async (companyId) => {
  try {
    if (!channelWrapper) await initializeRabbitMQ();
    await channelWrapper.sendToQueue('report-queue', { type: 'inventory_summary', companyId });
    logger.info(`Inventory summary report task queued for company ${companyId}`);
  } catch (error) {
    logger.error('Error in inventory summary scheduler: %s', error.message);
    throw error;
  }
};

module.exports = { scheduleDailyReport, scheduleInventorySummary, initializeRabbitMQ, shutdownRabbitMQ };