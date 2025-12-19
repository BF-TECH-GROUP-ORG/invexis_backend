require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const helmet = require('helmet');
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
const ErrorHandler = require('/app/shared/errorHandler');

const { connect: connectRabbitMQ } = require("/app/shared/rabbitmq");
const sequelize = require("./config/db");
// CORS handled by api-gateway; do not enable here
const { initPublishers } = require("./events/producer");
const consumeEvents = require("./events/consumer");
const { startOutboxDispatcher } = require("./workers/outboxDispatcher");

// Initialize logger
const logger = getLogger('sales-service');

const salesRouter = require("./routes");

const PORT = process.env.PORT || 9000;

const app = express();

// ✅ Trust proxy - Required for rate limiting behind API gateway
app.set('trust proxy', true);

// Initialize health checker and security manager
const healthChecker = new HealthChecker('sales-service');
const securityManager = new SecurityManager('sales-service');

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
      const sanitizeObj = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
          if (typeof key === 'string' && (key.includes('$') || key.includes('.'))) {
            continue;
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

      if (req.body && typeof req.body === 'object') {
        req.body = sanitizeObj(req.body);
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
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
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
      knownUsers: "/known-users",
      invoices: "/invoices",
      health: "/health",
    },
  });
});

// API Routes
app.use("/sales", salesRouter);


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
    
    // Only create tables if they don't exist, don't alter them
    await sequelize.sync({ force: false, alter: true });
    
    // Manually add the unique constraint if it doesn't exist
    try {
      const [results] = await sequelize.query(`
        SELECT COUNT(*) as index_count 
        FROM information_schema.STATISTICS 
        WHERE table_schema = DATABASE() 
        AND table_name = 'invoices' 
        AND index_name = 'invoices_invoiceNumber'
      `);
      
      if (results[0].index_count === 0) {
        console.log("Adding unique index on invoiceNumber...");
        await sequelize.query(`
          CREATE UNIQUE INDEX invoices_invoiceNumber 
          ON invoices(invoiceNumber)
        `);
      }
    } catch (indexError) {
      console.warn("⚠️ Could not ensure invoiceNumber index:", indexError.message);
      // Continue running even if index creation fails
    }
    
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
  console.log(`📍 Sales endpoint: http://localhost:${PORT}/sales`);
  console.log(`📍 KnownUsers endpoint: http://localhost:${PORT}/known-users`);
});
module.exports = app;
