const connectDB = require('./config/db');
const logger = require('./utils/app');
const PORT = 3004;
const app = require('./app');

const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => logger.info(`Server running on port http://localhost:${PORT}`));
    logger.info('Server started successfully');
  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`, error);
    process.exit(1);
  }
};

startServer();