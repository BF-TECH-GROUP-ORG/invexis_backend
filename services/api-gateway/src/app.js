const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const {
  routes,
  authProxy,
  companyProxy,
  shopProxy,
  inventoryProxy,
  salesProxy,
  paymentProxy,
  ecommerceProxy,
  notificationProxy,
  analyticsProxy,
  auditProxy,
  debtProxy,
  websocketProxy,
  authenticateToken,
} = require("./routes/proxy");
const { limiter, authLimiter } = require("./utils/rateLimiter");

const app = express();

// Security middleware
app.use(helmet()); // Set security HTTP headers
app.use(mongoSanitize()); // Sanitize data against NoSQL injection
app.use(xss()); // Sanitize data against XSS

// CORS configuration
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true,
  })
);

// Trust proxy (for rate limiting behind reverse proxy)
app.set("trust proxy", 1);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.originalUrl} - ${req.ip}`);
  next();
});

// Health check and custom routes (no auth required)
app.use("/", routes);

// Global rate limiter (applied to all proxied routes)
app.use("/api", limiter);

/**
 * Service Proxies
 * Auth is handled by individual services based on their requirements
 * Gateway forwards the Authorization header to services
 */

// Auth service (public + protected routes, has its own rate limiting)
app.use("/api/auth", authLimiter, authProxy);

// Protected services (require authentication - enforced by services themselves)
app.use("/api/company", companyProxy);
app.use("/api/shop", shopProxy);
app.use("/api/inventory", inventoryProxy);
app.use("/api/sales", salesProxy);
app.use("/api/payment", paymentProxy);
app.use("/api/ecommerce", ecommerceProxy);
app.use("/api/notification", notificationProxy);
app.use("/api/analytics", analyticsProxy);
app.use("/api/audit", auditProxy);
app.use("/api/debt", debtProxy);

// WebSocket service (special handling for WS upgrade)
app.use("/api/websocket", websocketProxy);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    service: "Invexis API Gateway",
    version: "1.0.0",
    status: "running",
    timestamp: new Date().toISOString(),
    endpoints: {
      health: "/health",
      healthAll: "/health/all",
      auth: "/api/auth",
      company: "/api/company",
      shop: "/api/shop",
      inventory: "/api/inventory",
      sales: "/api/sales",
      payment: "/api/payment",
      ecommerce: "/api/ecommerce",
      notification: "/api/notification",
      analytics: "/api/analytics",
      audit: "/api/audit",
      debt: "/api/debt",
      websocket: "/api/websocket",
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString(),
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("❌ Gateway Error:", err.message);
  console.error(err.stack);

  res.status(err.status || 500).json({
    error: err.message || "Internal Server Error",
    timestamp: new Date().toISOString(),
  });
});

module.exports = app;
