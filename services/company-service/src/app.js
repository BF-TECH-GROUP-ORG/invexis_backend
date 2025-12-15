require("dotenv").config();
const express = require("express");
const { connect: connectRabbitMQ } = require("/app/shared/rabbitmq");

const { initPublishers } = require("./events/producer");
const consumeEvents = require("./events/consumer");
// Import routes
const { startOutboxDispatcher } = require("./workers/outboxDispatcher");
const logger = require("./utils/logger");

const router = require('./routes/index')


const app = express();
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.originalUrl} - ${req.ip}`);
  next();
});
const allowedOrigins = ["http://localhost:3000", "https://yourdomain.com"];

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }

  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});
// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Performance monitoring middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  const originalSend = res.send;

  // Override send to capture response time
  res.send = function (data) {
    const duration = Date.now() - startTime;
    const isSlow = duration > 50; // SLA: 50ms
    
    if (isSlow) {
      logger.warn(`SLOW_ENDPOINT: ${req.method} ${req.path} took ${duration}ms (SLA: 50ms)`);
    } else {
      logger.debug(`${req.method} ${req.path} completed in ${duration}ms`);
    }
    
    // Add timing header
    res.set('X-Response-Time', `${duration}ms`);
    return originalSend.call(this, data);
  };

  next();
});

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    service: "company-service",
    timestamp: new Date().toISOString(),
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Company Service API",
    version: "1.0.0",
    endpoints: {
      companies: "/api/companies",
      roles: "/api/roles",
      companyUsers: "/api/company-users",
      subscriptions: "/api/subscriptions",
    },
  });
});

// API Routes
app.use("/company", router);


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

// Initialize RabbitMQ and event consumers
const initializeEventSystem = async () => {
  try {
    await connectRabbitMQ();
    await consumeEvents();
    await initPublishers();
    await startOutboxDispatcher(5000);
    console.log("✅ Event system initialized");
  } catch (error) {
    console.error("❌ Failed to initialize event system:", error);
    // Continue running even if RabbitMQ fails
  }
};

// Initialize event system on startup
initializeEventSystem();

module.exports = app;
