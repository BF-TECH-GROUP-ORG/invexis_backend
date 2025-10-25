const connectDB = require('./config/db');
const logger = require('./utils/logger');
const { scheduleDailyReport } = require('./services/reportService');
const PORT = process.env.PORT || 8007;
const app = require('./app');


const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => logger.info(`Server running on port http://localhost:${PORT}`));
    // await scheduleDailyReport();
    require('./app');
    logger.info('Server started successfully');
  } catch (error) {
    logger.error('Failed to start server: %s', error.message);
    process.exit(1);
  }
};

startServer();