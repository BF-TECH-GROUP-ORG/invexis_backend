// company-service production-ready index.js
require('dotenv').config();
const app = require("./app");
const { closeRabbitMQ } = require("./config/rabbitmq");
const { initWorkerQueue } = require("./workers/backgroundJobs");
const { getLogger } = require("/app/shared/logger");
const HealthChecker = require("/app/shared/health");

const PORT = process.env.PORT || 8004;
const SERVICE_NAME = 'company-service';

// Initialize production modules
const logger = getLogger(SERVICE_NAME);
const healthChecker = new HealthChecker(SERVICE_NAME, {
  postgresql: true,
  redis: true,
  rabbitmq: true,
  timeout: 5000
});

// Setup health check routes
healthChecker.setupRoutes(app);

const server = app.listen(PORT, async () => {
  logger.info('Company Service started successfully', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    pid: process.pid
  });

  console.log(`🏢 Company Service running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || "development"}`);

  // Initialize background worker queue
  try {
    await initWorkerQueue();
    logger.info('Background worker queue initialized successfully');
  } catch (err) {
    logger.warn('Background worker queue initialization failed (non-blocking)', { error: err.message });
  }

  // Start subscription auto-renewal cron job (Smart Guard Enabled)
  try {
    const subscriptionRenewalCron = require('./cron/subscriptionRenewal.cron');
    subscriptionRenewalCron.start();
    logger.info('Subscription smart guard cron job started');
  } catch (err) {
    logger.warn('Subscription cron job initialization failed (non-blocking)', { error: err.message });
  }

  // 📦 Start Outbox Dispatcher
  try {
    const { initPublishers } = require('./events/producer');
    const { startOutboxDispatcher } = require('./workers/outboxDispatcher');

    // 1. Initialize Publishers
    await initPublishers();

    // 2. Start Dispatcher (every 5 seconds)
    startOutboxDispatcher(5000);

    logger.info('Outbox Dispatcher & Publishers initialized successfully');
  } catch (err) {
    logger.error('Failed to start Outbox Dispatcher', { error: err.message });
  }
});

// Enhanced graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}, starting graceful shutdown`);

  server.close(async () => {
    logger.info("HTTP server closed");

    try {
      await closeRabbitMQ();
      logger.info("RabbitMQ connection closed");
    } catch (error) {
      logger.error("Error closing RabbitMQ", { error: error.message });
    }

    logger.info("Company Service shutdown completed");
    process.exit(0);
  });

  // Force close after 30 seconds
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 30000);
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason?.message || reason,
    stack: reason?.stack
  });
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    message: error.message,
    stack: error.stack,
    name: error.name
  });
  process.exit(1);
});