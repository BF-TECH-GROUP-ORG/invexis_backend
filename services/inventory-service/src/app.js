require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const { connect: connectRabbitMQ } = require("/app/shared/rabbitmq");

const { initPublishers } = require("./events/producer");
const consumeEvents = require("./events/consumer");
const { startOutboxDispatcher } = require("./workers/outboxDispatcher");
const connectDB = require("./config/db");

const router = require("./routes/index");

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    service: "inventory-service",
    timestamp: new Date().toISOString(),
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Inventory Service API",
    version: "1.0.0",
    endpoints: {
      products: "/inventory/products",
      categories: "/inventory/categories",
      warehouses: "/inventory/warehouses",
      stock: "/inventory/stock",
      alerts: "/inventory/alerts",
      health: "/health",
    },
  });
});

// API Routes
app.use("/inventory", router);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err.message);
  console.error("Stack:", err.stack);

  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode).json({
    success: false,
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? "🥞" : err.stack,
  });
});

// Initialize database
const initializeDatabase = async () => {
  try {
    await connectDB();
    console.log("✅ Database connection established");
  } catch (error) {
    console.error("❌ Failed to connect to database:", error);
    process.exit(1);
  }
};

// Initialize RabbitMQ and event system
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

// Initialize everything on startup
const initialize = async () => {
  await initializeDatabase();
  await initializeEventSystem();
};

module.exports = { app, initialize };
