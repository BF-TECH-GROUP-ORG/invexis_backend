require("dotenv").config();
const express = require("express");
const { connect: connectRabbitMQ } = require("/app/shared/rabbitmq");

const router = require("./routes/shop");
const { initPublishers } = require("./events/producer");
const consumeEvents = require("./events/consumer");
const { startOutboxDispatcher } = require("./workers/outboxDispatcher");
const db = require("./config/db");

const PORT = process.env.PORT || 9001;
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get("/", (req, res) => {
  res.json({ message: "Shop Service is running" });
});

app.use("/shop", router);

app.get("/health", (req, res) => res.sendStatus(200));

// Initialize database and event system
const initializeApp = async () => {
  try {
    // Test database connection
    await db.testConnection();

    // Run migrations
    await db.runMigrations();

    // Initialize RabbitMQ and event system
    await initializeEventSystem();

    console.log("✅ Application initialized successfully");
  } catch (error) {
    console.error("❌ Failed to initialize application:", error.message);
    process.exit(1);
  }
};

// Initialize RabbitMQ and event consumers
const initializeEventSystem = async () => {
  try {
    await connectRabbitMQ();
    await consumeEvents();
    await initPublishers();
    await startOutboxDispatcher(1000); // Process outbox every 1 second
    console.log("✅ Event system initialized");
  } catch (error) {
    console.error("❌ Failed to initialize event system:", error);
    // Continue running even if RabbitMQ fails
  }
};

// Start server
const startServer = async () => {
  await initializeApp();

  app.listen(PORT, () => {
    console.log(`🚀 Shop Service running on port ${PORT}`);
  });
};

startServer().catch((error) => {
  console.error("❌ Failed to start server:", error);
  process.exit(1);
});
