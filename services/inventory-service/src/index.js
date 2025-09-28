const connectDB = require('./config/db');
const logger = require('./utils/logger');
const { scheduleDailyReport } = require('./services/reportService');

const startServer = async () => {
  try {
    await connectDB();
    await scheduleDailyReport();
    require('./app');
    logger.info('Server started successfully');
  } catch (error) {
    logger.error('Failed to start server: %s', error.message);
    process.exit(1);
  }
};

startServer();