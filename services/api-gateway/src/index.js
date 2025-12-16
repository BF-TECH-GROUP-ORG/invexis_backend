require("dotenv").config();
const app = require("./app");
const { getLogger } = require("/app/shared/logger");
const HealthChecker = require("/app/shared/health");

const PORT = process.env.PORT || 8000;
const NODE_ENV = process.env.NODE_ENV || "development";
const SERVICE_NAME = "api-gateway";

// Initialize logger and health checker
const logger = getLogger(SERVICE_NAME);
const healthChecker = new HealthChecker(SERVICE_NAME, {
  redis: true,
  rabbitmq: true,
  timeout: 5000
});

// Setup health check routes
healthChecker.setupRoutes(app);

// Setup graceful shutdown
healthChecker.setupGracefulShutdown();

// Start server
const server = app.listen(PORT, "0.0.0.0", () => {
  logger.info("API Gateway started successfully", {
    port: PORT,
    environment: NODE_ENV,
    nodeVersion: process.version,
    pid: process.pid
  });

  console.log("=".repeat(60));
  console.log(`🚀 Invexis API Gateway`);
  console.log(`📡 Environment: ${NODE_ENV}`);
  console.log(`🌐 Port: ${PORT}`);
  console.log(`🔗 URL: http://localhost:${PORT}`);
  console.log(`⏰ Started: ${new Date().toISOString()}`);
  console.log("=".repeat(60));
  console.log("\n📋 Available Routes:");
  console.log("  GET  /health        - Health check");
  console.log("  GET  /health/ready  - Readiness probe");
  console.log("  GET  /health/live   - Liveness probe");
  console.log("  GET  /metrics       - Prometheus metrics");
  console.log("  *    /api/auth      → Auth Service");
  console.log("  *    /api/company   → Company Service");
  console.log("  *    /api/shop      → Shop Service");
  console.log("  *    /api/inventory → Inventory Service");
  console.log("  *    /api/sales     → Sales Service");
  console.log("  *    /api/payment   → Payment Service");
  console.log("  *    /api/ecommerce → E-commerce Service");
  console.log("  *    /api/notification → Notification Service");
  console.log("  *    /api/analytics → Analytics Service");
  console.log("  *    /api/audit     → Audit Service");
  console.log("  *    /api/debt      → Debt Service");
  console.log("  *    /api/websocket → WebSocket Service");
  console.log("=".repeat(60));
});

// Enhanced graceful shutdown
const shutdown = async (signal) => {
  logger.info(`Received ${signal}, starting graceful shutdown`);
  
  server.close(async (err) => {
    if (err) {
      logger.error("Error closing server", { error: err.message });
      process.exit(1);
    }
    
    logger.info("Server closed successfully");
    process.exit(0);
  });
  
  // Force close after 30 seconds
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 30000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("SIGINT", () => {
  console.log("\n⚠️  SIGINT received, shutting down gracefully...");
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Rejection:", err);
  process.exit(1);
});
