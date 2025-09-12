const { app, logger } = require('./app');
const mongoose = require('mongoose');
const { connectDB } = require('./config/db');
const { connectRabbitMQ, closeRabbitMQ } = require('./config/rabbitmq');
const { scheduleDailyReport } = require('./services/reportService');

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await connectDB();
    await connectRabbitMQ();
    scheduleDailyReport();
    app.listen(PORT, () => logger.info(`Invexis Inventory Service running on port ${PORT}`));
  } catch (error) {
    logger.error('Server startup error:', error);
    process.exit(1);
  }
};

startServer();

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down');
  await closeRabbitMQ();
  await mongoose.connection.close();
  process.exit(0);
});