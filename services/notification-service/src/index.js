// src/index.js
require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");
const { connect: connectRabbitMQ } = require("/app/shared/rabbitmq");
const redisClient = require("/app/shared/redis");
const notificationQueue = require("./config/queue");
const consumeEvents = require("./events/consumer");
const { initPublishers } = require("./events/producer");
const logger = require("./utils/logger");

const app = express();
const PORT = process.env.PORT || 8008;

// Middleware
app.use(express.json());

// Routes
// Health endpoint defined before API routes to prevent conflicts
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "notification-service",
  });
});

app.get("/ready", async (_req, res) => {
  try {
    const redisOk = redisClient.isConnected;

    if (redisOk) {
      res.json({ ready: true });
    } else {
      res.status(503).json({ ready: false, reason: "Dependencies not ready" });
    }
  } catch (error) {
    res.status(503).json({ ready: false, error: error.message });
  }
});

// Routes
const notificationRoutes = require("./routes/notification");
// Mount at specific api path AND root (for flexibility) AFTER health checks
app.use("/api/notifications", notificationRoutes);
app.use("/", notificationRoutes);


app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "notification-service",
  });
});

app.get("/ready", async (_req, res) => {
  try {
    const redisOk = redisClient.isConnected;

    if (redisOk) {
      res.json({ ready: true });
    } else {
      res.status(503).json({ ready: false, reason: "Dependencies not ready" });
    }
  } catch (error) {
    res.status(503).json({ ready: false, error: error.message });
  }
});

const start = async () => {
  try {
    // Connect to database
    await connectDB();
    logger.info("✅ Database connected");

    // Connect to RabbitMQ
    await connectRabbitMQ();
    logger.info("✅ RabbitMQ connected");

    // Initialize event publishers
    await initPublishers();
    logger.info("✅ Event publishers initialized");

    // Start event consumers
    await consumeEvents();
    logger.info("✅ Event consumers started");

    // Start server
    app.listen(PORT, () => {
      logger.info(`🚀 Notification Service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error("Failed to start notification service:", error);
    process.exit(1);
  }
};

start().catch((err) => {
  logger.error("Failed to start:", err);
  process.exit(1);
});

process.on("SIGINT", async () => {
  logger.info("Shutting down gracefully...");
  await notificationQueue.close();
  process.exit(0);
});
