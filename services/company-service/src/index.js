const app = require("./app");
const { closeRabbitMQ } = require("./config/rabbitmq");
const { initWorkerQueue } = require("./workers/backgroundJobs");
const logger = require("./utils/logger");

const PORT = process.env.PORT || 8002;

const server = app.listen(PORT, async () => {
  console.log(`🚀 Company Service running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || "development"}`);
  
  // Initialize background worker queue
  try {
    await initWorkerQueue();
  } catch (err) {
    logger.warn('Background worker queue initialization failed (non-blocking):', err);
  }
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  server.close(async () => {
    console.log("HTTP server closed");

    try {
      await closeRabbitMQ();
      console.log("RabbitMQ connection closed");
    } catch (error) {
      console.error("Error closing RabbitMQ:", error);
    }

    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
