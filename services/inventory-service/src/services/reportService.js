/**
 * reportService.js
 * Listen to company events → Generate inventory report → Emit report
 */

const logger = require('../utils/logger');
const rabbitmq = require('/app/shared/rabbitmq.js');
const redis = require('/app/shared/redis.js');
const { getInventorySummary } = require('../controllers/reportController');

const EVENT_QUEUE = 'company-events';
const REPORT_QUEUE = 'report-queue';
const CACHE_TTL = 3600;

let isReady = false;

async function getCachedReport(companyId) {
  const key = `inventory-report:${companyId}`;
  const data = await redis.get(key);
  if (data) {
    logger.info(`Cache hit for company ${companyId}`);
    return JSON.parse(data);
  }
  return null;
}

async function cacheReport(companyId, report) {
  const key = `inventory-report:${companyId}`;
  await redis.set(key, JSON.stringify(report), 'EX', CACHE_TTL);
  logger.info(`Cached report for company ${companyId}`);
}

const initializeRabbitMQ = async () => {
  if (isReady) return;

  let retries = 5;
  while (retries-- > 0) {
    try {
      logger.info('Connecting to RabbitMQ...');
      await rabbitmq.connect();
      isReady = true;
      logger.info('RabbitMQ connected');

      // Use consume() — no binding, no ACCESS_REFUSED
      await rabbitmq.consume(EVENT_QUEUE, async (msg) => {
        if (!msg) return;

        try {
          const { companyId } = JSON.parse(msg.content.toString());
          if (!companyId) {
            logger.warn('Missing companyId');
            rabbitmq.channel.ack(msg);
            return;
          }

          logger.info(`Processing report for company ${companyId}`);

          let report = await getCachedReport(companyId);
          if (!report) {
            report = await getInventorySummary({ user: { companyId } });
            await cacheReport(companyId, report);
          }

          const ok = await rabbitmq.publish('', REPORT_QUEUE, {
            companyId,
            type: 'inventory_summary',
            report
          });

          logger[ok ? 'info' : 'error'](`Report ${ok ? 'sent' : 'failed'}`);

          rabbitmq.channel.ack(msg);
        } catch (err) {
          logger.error(`Error: ${err.message}`);
          rabbitmq.channel.nack(msg, false, false);
        }
      });

      logger.info('Report generator is ACTIVE');
      return;
    } catch (err) {
      logger.error(`Init failed: ${err.message}`);
      isReady = false;
      if (retries === 0) throw err;
      await new Promise(r => setTimeout(r, 5000));
    }
  }
};

const triggerReport = async (companyId) => {
  if (!isReady) await initializeRabbitMQ();
  await rabbitmq.publish('', EVENT_QUEUE, { companyId });
  logger.info(`Triggered report for ${companyId}`);
};

initializeRabbitMQ().catch(err => {
  logger.error('Startup failed:', err.message);
  process.exit(1);
});

module.exports = { triggerReport, initializeRabbitMQ };