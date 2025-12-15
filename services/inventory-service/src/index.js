const { app, initialize } = require("./app");
const { close: closeRabbitMQ } = require("/app/shared/rabbitmq");
const { getLogger } = require('/app/shared/logger');

const logger = getLogger('inventory-service');
const PORT = process.env.PORT || 8007;

const server = app.listen(PORT, () => {
  initialize();
  logger.info(`🚀 Inventory Service running on port ${PORT}`);
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`\n${signal} received. Starting graceful shutdown...`);

  server.close(async () => {
    logger.info("HTTP server closed");

    try {
      await closeRabbitMQ();
      logger.info("RabbitMQ connection closed");
    } catch (error) {
      logger.error("Error closing RabbitMQ:", error);
    }

    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection:', err);
  server.close(() => {
    process.exit(1);
  });
});