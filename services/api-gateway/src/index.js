require("dotenv").config();
const app = require("./app");
const morgan = require("morgan");

const PORT = process.env.PORT || 8000;
const NODE_ENV = process.env.NODE_ENV || "development";

// HTTP request logging
if (NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

// Start server
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log("=".repeat(60));
  console.log(`🚀 Invexis API Gateway`);
  console.log(`📡 Environment: ${NODE_ENV}`);
  console.log(`🌐 Port: ${PORT}`);
  console.log(`🔗 URL: http://localhost:${PORT}`);
  console.log(`⏰ Started: ${new Date().toISOString()}`);
  console.log("=".repeat(60));
  console.log("\n📋 Available Routes:");
  console.log("  GET  /              - Gateway info");
  console.log("  GET  /health        - Gateway health");
  console.log("  GET  /health/all    - All services health");
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

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("\n⚠️  SIGTERM received, shutting down gracefully...");
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});

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
