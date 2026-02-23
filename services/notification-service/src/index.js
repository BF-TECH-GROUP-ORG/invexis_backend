// notification-service production-ready index.js
require("dotenv").config();
const express = require("express");
const { getLogger } = require("/app/shared/logger");
const HealthChecker = require("/app/shared/health");
const { SecurityManager } = require("/app/shared/security");
const { ErrorHandler } = require("/app/shared/errorHandler");

const app = express();
// Trust proxy (required for rate limiting behind Traefik/Docker)
app.set('trust proxy', 1);
const PORT = process.env.PORT || 8008;
const SERVICE_NAME = 'notification-service';

// Initialize production modules
const logger = getLogger(SERVICE_NAME);
const healthChecker = new HealthChecker(SERVICE_NAME, {
  mongodb: true,
  redis: true,
  rabbitmq: true,
  timeout: 5000
});
const security = new SecurityManager(SERVICE_NAME);
const errorHandler = new ErrorHandler(SERVICE_NAME);

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Setup security middleware
security.setupSecurity(app);

// Request logging
app.use(logger.requestLogger());

// Health check routes
healthChecker.setupRoutes(app);

// Initialize services
let connectDB, connectRabbitMQ, redisClient, notificationQueue, consumeEvents, initPublishers, schedulerService;

try {
  connectDB = require("./config/db");
  redisClient = require("/app/shared/redis");
  notificationQueue = require("./config/queue");
  consumeEvents = require("./events/consumer");
  const { initPublishers: initPub } = require("./events/producer");
  initPublishers = initPub;
  schedulerService = require("./services/scheduler");

  // Try to get RabbitMQ connection
  try {
    const rabbitmq = require("/app/shared/rabbitmq");
    connectRabbitMQ = rabbitmq.connect;
  } catch (err) {
    logger.warn('RabbitMQ shared module not available', { error: err.message });
    connectRabbitMQ = async () => logger.info('RabbitMQ connection skipped');
  }
} catch (err) {
  logger.warn('Some notification service modules not available', { error: err.message });
  console.error("❌ CRITICAL: Notification service module initialization failed:", err);
  console.error("Stack:", err.stack);
}

// Routes
// Device Registry Routes
const deviceRoutes = require('./routes/device.routes');
app.use('/devices', deviceRoutes);

// Routes for notifications
const notificationRoutes = require("./routes/notification");
// Mount at specific api path
app.use("/notification", notificationRoutes);

// Status endpoint - check circuit breakers and service health (no auth required)
app.get('/status', (req, res) => {
  try {
    const { pushCircuitBreaker } = require('./channels/push');
    const { getCircuitBreakerStatus } = require('./utils/circuitBreaker');
    
    const pushStats = pushCircuitBreaker.stats;
    
    res.json({
      service: 'notification-service',
      status: 'operational',
      timestamp: new Date().toISOString(),
      circuitBreaker: {
        push: {
          state: pushCircuitBreaker.opened ? 'open' : pushCircuitBreaker.halfOpen ? 'half-open' : 'closed',
          stats: {
            fires: pushStats.fires,
            failures: pushStats.failures,
            successes: pushStats.successes,
            timeouts: pushStats.timeouts,
            fallbacks: pushStats.fallbacks,
            errorRate: pushStats.fires > 0 ? ((pushStats.failures / pushStats.fires) * 100).toFixed(2) + '%' : 'N/A'
          }
        }
      },
      firebase: {
        initialized: !!require('./config/push')
      }
    });
  } catch (error) {
    res.status(500).json({
      service: 'notification-service',
      status: 'error',
      error: error.message
    });
  }
});

// Error handling
errorHandler.setupErrorHandlers(app);

// Start server with proper initialization
const startServer = async () => {
  try {
    // Connect to databases and services
    if (connectDB) {
      await connectDB();
      logger.info('Database connected successfully');
    }

    if (connectRabbitMQ) {
      await connectRabbitMQ();
      logger.info('RabbitMQ connected successfully');
    }

    if (redisClient?.connect) {
      await redisClient.connect();
      logger.info('Redis connected successfully');
    }

    // Initialize notification consumers and publishers
    if (consumeEvents) {
      await consumeEvents();
      logger.info('Event consumers initialized');
    }

    if (initPublishers) {
      await initPublishers();
      logger.info('Event publishers initialized');
    }

    // Ensure queue is ready to process
    if (notificationQueue) {
      await notificationQueue.isReady();
      logger.info('Notification Delivery Queue ready');
    }

    // Initialize Scheduler
    if (schedulerService) {
      await schedulerService.init();
    }

    // Start HTTP server
    const server = app.listen(PORT, () => {
      logger.info('Notification Service started successfully', {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
        pid: process.pid
      });

      console.log(`
      ╔══════════════════════════════════════════════════════════════╗
      ║                                                              ║
      ║   🔔  NOTIFICATION SERVICE ONLINE                            ║
      ║   🚀  Listening for: user.created, sale.created, etc.        ║
      ║   📡  Port: ${PORT}                                          ║
      ║                                                              ║
      ╚══════════════════════════════════════════════════════════════╝
      `);
      console.log(`🔔 Notification Service running on port ${PORT}`);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}, starting graceful shutdown`);

      server.close(async (err) => {
        if (err) {
          logger.error('Error closing server', { error: err.message });
          process.exit(1);
        }

        try {
          if (redisClient?.quit) {
            await redisClient.quit();
            logger.info('Redis connection closed');
          }
        } catch (redisError) {
          logger.warn('Error closing Redis', { error: redisError.message });
        }

        logger.info('Notification Service shutdown completed');
        process.exit(0);
      });

      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start notification service', { error: error.message, stack: error.stack });
    console.error('Startup error:', error);
    process.exit(1);
  }
};

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason?.message || reason,
    stack: reason?.stack
  });
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    message: error.message,
    stack: error.stack,
    name: error.name
  });
  process.exit(1);
});

// Start the service
startServer();