const { getChannel } = require('../config/rabbitmq');
const { logger } = require('../utils/logger');
const { updateProductReportFromSale } = require('../services/reportService');

const consumeSalesEvents = async () => {
  try {
    const channel = getChannel();
    if (!channel) throw new Error('RabbitMQ channel not initialized');
    await channel.consume('sales.events', async (msg) => {
      if (msg !== null) {
        const { eventType, data } = JSON.parse(msg.content.toString());
        if (eventType === 'sale.completed') {
          await updateProductReportFromSale(data);
          logger.info(`Processed sale event for product ${data.productId}`);
        }
        channel.ack(msg);
      }
    });
    logger.info('Started consuming sales events');
  } catch (error) {
    logger.error('Failed to consume sales events:', error);
  }
};

module.exports = { consumeSalesEvents };