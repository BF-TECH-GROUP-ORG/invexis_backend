require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const { connect: connectRabbitMQ } = require("/app/shared/rabbitmq");
const sequelize = require("./config/db");

const { initPublishers } = require("./events/producer");
const consumeEvents = require("./events/consumer");
const { startOutboxDispatcher } = require("./workers/outboxDispatcher");

const salesRouter = require("./routes/SalesRoutes");
const invoiceRouter = require("./routes/InvoiceRoutes");
const PORT = process.env.PORT || 9000;

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
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
    service: "sales-service",
    timestamp: new Date().toISOString(),
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Sales Service API",
    version: "1.0.0",
    endpoints: {
      sales: "/sales",
      health: "/health",
    },
  });
});

// API Routes
app.use("/sales", salesRouter);
app.use("/invoices", invoiceRouter);

// Serve PDF files statically
app.use("/invoices/pdf", express.static("storage/invoices"));

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
    await sequelize.authenticate();
    console.log("✅ Database connection established");

    // Sync models (create tables if they don't exist)
    await sequelize.sync({ alter: true });
    console.log("✅ Database models synchronized");
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
    await startOutboxDispatcher(1000); // Process outbox every 5 seconds
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


app.listen(PORT, () => {
  initialize()
  console.log(`🚀 Sales Service running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📍 API endpoint: http://localhost:${PORT}/sales`);
});
module.exports = app;
