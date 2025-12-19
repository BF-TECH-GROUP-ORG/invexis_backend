const { app, initialize } = require("./app");
const { close: closeRabbitMQ } = require("/app/shared/rabbitmq");
const { getLogger } = require('/app/shared/logger');

const logger = getLogger('inventory-service');
const PORT = process.env.PORT || 8007;

const server = app.listen(PORT, () => {
  initialize();
  logger.info(`🚀 Inventory Service running on port ${PORT}`);
});

// Start background upload retry worker (best-effort)
try {
  const uploadRetryWorker = require('./workers/uploadRetryWorker');
  if (uploadRetryWorker && typeof uploadRetryWorker.loop === 'function') {
    uploadRetryWorker.loop(5000);
  }
} catch (e) {
  logger.warn('UploadRetryWorker failed to start:', e && e.message ? e.message : e);
}

// Start background upload cleanup worker (deletes old failed tasks)
try {
  const uploadCleanupWorker = require('./workers/uploadCleanupWorker');
  if (uploadCleanupWorker && typeof uploadCleanupWorker.loop === 'function') {
    uploadCleanupWorker.loop(60 * 60 * 1000); // Run every hour
  }
} catch (e) {
  logger.warn('UploadCleanupWorker failed to start:', e && e.message ? e.message : e);
}

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
process.on('unhandledRejection', (reason) => {
  try {
    // Normalize different shapes of rejection payloads for clearer logs
    const err = reason && reason.error ? reason.error : reason;

    // If this is a timeout from upstream (http_code 499 / TimeoutError), log and continue
    const isTimeout = (err && (err.http_code === 499 || err.code === 'ETIMEDOUT' || err.name === 'TimeoutError' || (err.message && err.message.toLowerCase().includes('timeout'))));

    // Treat client-side errors (400-498) and known validation/provider errors as non-fatal
    const httpCode = err && (err.http_code || err.status || (err.response && err.response.status));
    const isClientError = typeof httpCode === 'number' && httpCode >= 400 && httpCode < 499 && httpCode !== 499;

    // Catch some known provider validation messages (e.g. invalid public_id from upload service)
    const message = err && (err.message || (err.response && err.response.data && err.response.data.message)) || '';
    const looksLikeValidation = typeof message === 'string' && (message.toLowerCase().includes('invalid public_id') || message.toLowerCase().includes('invalid public id') || message.toLowerCase().includes('invalid public_id') || message.toLowerCase().includes('validation failed'));

    if (isTimeout) {
      logger.warn('Unhandled rejection (timeout) — non-fatal:', typeof err === 'object' ? JSON.stringify(err) : String(err));
      return;
    }

    if (isClientError || looksLikeValidation) {
      // Log at warn level and continue — these are usually caused by bad input or upstream validation
      logger.warn('Unhandled rejection (client/validation) — non-fatal:', typeof err === 'object' ? JSON.stringify(err, Object.getOwnPropertyNames(err)) : String(err));
      return;
    }

    // For other errors, log full details and attempt graceful shutdown
    logger.error('Unhandled Promise Rejection — terminating:', typeof err === 'object' ? JSON.stringify(err, Object.getOwnPropertyNames(err)) : String(err));
    if (server && typeof server.close === 'function') {
      server.close(() => {
        // give other shutdown handlers a moment
        setTimeout(() => process.exit(1), 100);
      });
    } else {
      process.exit(1);
    }
  } catch (logErr) {
    // If logging itself fails, ensure we still exit to avoid undefined state
    try { console.error('Failed while handling unhandledRejection:', logErr); } catch (e) { }
    process.exit(1);
  }
});

// Catch uncaught exceptions so the process can log and exit gracefully
process.on('uncaughtException', (err) => {
  try {
    logger.error('Uncaught Exception — terminating:', err && err.stack ? err.stack : JSON.stringify(err));
  } catch (e) {
    try { console.error('Error logging uncaughtException', e); } catch (e2) { }
  }
  // Force exit after attempting to close server
  if (server && typeof server.close === 'function') {
    server.close(() => setTimeout(() => process.exit(1), 100));
  } else {
    process.exit(1);
  }
});