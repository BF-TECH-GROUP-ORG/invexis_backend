// Completely disable dotenv logging
process.env.DOTENV_CONFIG_SILENT = 'true';
process.env.DOTENV_CONFIG_QUIET = 'true';
require("dotenv").config({ silent: true, debug: false });
const express = require("express");
const helmet = require("helmet");
const compression = require('compression');

// Optional dependencies with fallbacks
let mongoSanitize, xss;
try {
  mongoSanitize = require('express-mongo-sanitize');
} catch (e) {
  mongoSanitize = null;
}

try {
  xss = require('xss-clean');
} catch (e) {
  xss = null;
}

// Import shared modules
const HealthChecker = require('/app/shared/health');
const { SecurityManager } = require('/app/shared/security');
const { getLogger } = require('/app/shared/logger');
const { ErrorHandler } = require('/app/shared/errorHandler');

const { connect: connectRabbitMQ } = require("/app/shared/rabbitmq");
const { initPublishers } = require("./events/producer");
const consumeEvents = require("./events/consumer");
const { startOutboxDispatcher } = require("./workers/outboxDispatcher");
const AlertCronJobWorker = require("./workers/alertCronJob");
const connectDB = require("./config/db");

// Initialize logger
const logger = getLogger('inventory-service');

const router = require("./routes/index");

const app = express();

// Initialize health checker and security manager
const healthChecker = new HealthChecker('inventory-service');
const securityManager = new SecurityManager('inventory-service');
const errorHandler = new ErrorHandler('inventory-service');

// Security middleware (CORS handled by API Gateway)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Trust API Gateway - validate requests come from gateway
app.use((req, res, next) => {
  const gatewayHeader = req.headers['x-gateway-request'];
  if (process.env.NODE_ENV === 'production' && !gatewayHeader) {
    return res.status(403).json({ error: 'Direct access not allowed. Requests must come through API Gateway.' });
  }
  next();
});

app.use(compression());

// Safe sanitization middleware (custom implementation)
if (mongoSanitize) {
  app.use((req, res, next) => {
    try {
      // Safe sanitization that doesn't modify read-only properties
      const sanitizeObj = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;

        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
          if (typeof key === 'string' && (key.includes('$') || key.includes('.'))) {
            continue; // Skip potentially dangerous keys
          }

          if (typeof value === 'object' && value !== null) {
            sanitized[key] = Array.isArray(value)
              ? value.map(item => sanitizeObj(item))
              : sanitizeObj(value);
          } else {
            sanitized[key] = value;
          }
        }
        return sanitized;
      };

      // Only sanitize if properties are writable
      if (req.body && typeof req.body === 'object') {
        req.body = sanitizeObj(req.body);
      }

      // Skip query sanitization for HEAD/GET requests to avoid conflicts
      if (req.method !== 'HEAD' && req.method !== 'GET' && req.query && typeof req.query === 'object') {
        try {
          Object.assign(req.query, sanitizeObj(req.query));
        } catch (err) {
          // Skip query sanitization if it causes errors
        }
      }

      if (req.params && typeof req.params === 'object') {
        try {
          Object.assign(req.params, sanitizeObj(req.params));
        } catch (err) {
          // Skip params sanitization if it causes errors
        }
      }

      next();
    } catch (error) {
      next();
    }
  });
}

// XSS protection (safe implementation)
if (xss) {
  app.use((req, res, next) => {
    try {
      // Only apply XSS cleaning to body content for safety
      if (req.body && typeof req.body === 'object') {
        const cleanObj = (obj) => {
          if (!obj || typeof obj !== 'object') return obj;

          const cleaned = {};
          for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
              cleaned[key] = value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
            } else if (typeof value === 'object' && value !== null) {
              cleaned[key] = Array.isArray(value)
                ? value.map(item => cleanObj(item))
                : cleanObj(value);
            } else {
              cleaned[key] = value;
            }
          }
          return cleaned;
        };

        req.body = cleanObj(req.body);
      }
      next();
    } catch (error) {
      next();
    }
  });
}

// Request parsing
app.use(express.json({ limit: '1000mb' }));
app.use(express.urlencoded({ extended: true }));

// Trust proxy for accurate IP addresses behind reverse proxy
app.set('trust proxy', 1);

// Health check routes
app.get("/health", healthChecker.getHealth.bind(healthChecker));
app.get("/ready", healthChecker.getReadiness.bind(healthChecker));
app.get("/live", healthChecker.getLiveness.bind(healthChecker));

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(`# HELP inventory_service_status Inventory service status\n# TYPE inventory_service_status gauge\ninventory_service_status 1\n`);
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Inventory Service API",
    version: "1.0.0",
    endpoints: {
      products: "/inventory/products",
      categories: "/inventory/categories",
      // warehouses endpoint removed
      stock: "/inventory/stock",
      alerts: "/inventory/alerts",
      health: "/health",
    },
  });
});

// API Routes
app.use("/inventory", router);

// Error handling middleware
app.use(errorHandler.notFoundHandler());
app.use(errorHandler.globalErrorHandler());

// Initialize database
const initializeDatabase = async () => {
  try {
    await connectDB();
  } catch (error) {
    logger.error("❌ Failed to connect to database:", error);
    process.exit(1);
  }
};

// Initialize RabbitMQ and event system
const initializeEventSystem = async () => {
  try {
    await connectRabbitMQ();
    await consumeEvents();
    await initPublishers();
    await startOutboxDispatcher(10000); // Process outbox every 10 second
    logger.info("✅ Event system initialized");
  } catch (error) {
    logger.error("❌ Failed to initialize event system:", error);
    // Continue running even if RabbitMQ fails
  }
};

// Initialize Alert Cron Jobs
const initializeAlertCronJobs = async () => {
  try {
    const cronWorker = AlertCronJobWorker.getInstance();
    await cronWorker.initializeAllJobs();
    logger.info("✅ Alert cron jobs initialized and running");
  } catch (error) {
    logger.error("❌ Failed to initialize alert cron jobs:", error);
    // Continue running even if cron jobs fail
  }
};

// Initialize everything on startup
const initialize = async () => {
  await initializeDatabase();
  await initializeEventSystem();
  await initializeAlertCronJobs();
};

module.exports = { app, initialize };
