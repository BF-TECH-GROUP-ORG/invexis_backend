require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const { connect: connect } = require("/app/shared/rabbitmq");

const { initPublishers } = require("./events/producer");
const consumeEvents = require("./events/consumer");
const { startOutboxDispatcher } = require("./workers/outboxDispatcher");
const { startCleaner } = require('./workers/abandonedCartCleaner');
const { warmupActiveCarts } = require('./workers/cacheWarmup');
const connectDB = require("./config/db");

const ecommerceRoute = require("./routes/ecommerceRoute");

const app = express();

// Middleware
app.use(helmet());
// CORS is handled at the API gateway; do not enable here
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
    service: "ecommerce-service",
    timestamp: new Date().toISOString(),
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Ecommerce Service API",
    version: "1.0.0",
    endpoints: {
      carts: "/ecommerce/carts",
      orders: "/ecommerce/orders",
      reviews: "/ecommerce/reviews",
      wishlist: "/ecommerce/wishlist",
      promotions: "/ecommerce/promotions",
      banners: "/ecommerce/banners",
      health: "/health",
    },
  });
});

// API Routes
app.use("/ecommerce", ecommerceRoute);

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
    await connect();
    await consumeEvents();
    await initPublishers();
    await startOutboxDispatcher(1000); // Process outbox every 1 second
    // Start background workers (run only in one instance in production)
    try {
      startCleaner();
      // Optionally warmup cache for a single company on startup (non-blocking)
      if (process.env.CACHE_WARMUP_COMPANY) {
        warmupActiveCarts(process.env.CACHE_WARMUP_COMPANY).catch(err => console.error('Cache warmup failed', err.message));
      }
    } catch (err) {
      console.error('Failed to start background workers', err.message);
    }
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
