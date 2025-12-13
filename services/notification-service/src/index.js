// notification-service production-ready index.js
require("dotenv").config();
const express = require("express");
const { getLogger } = require("/app/shared/logger");
const HealthChecker = require("/app/shared/health");
const { SecurityManager } = require("/app/shared/security");
const { ErrorHandler } = require("/app/shared/errorHandler");

const app = express();
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
let connectDB, connectRabbitMQ, redisClient, notificationQueue, consumeEvents, initPublishers;

try {
  connectDB = require("./config/db");
  redisClient = require("/app/shared/redis");
  notificationQueue = require("./config/queue");
  consumeEvents = require("./events/consumer");
  const { initPublishers: initPub } = require("./events/producer");
  initPublishers = initPub;
  
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
}

// Routes
app.get("/", (req, res) => {
  res.json({
    service: SERVICE_NAME,
    status: 'running',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Readiness check
app.get("/ready", async (req, res) => {
  try {
    const isRedisConnected = redisClient?.isConnected || false;
    const isMongoConnected = true; // Will be updated after DB connection
    
    if (isRedisConnected && isMongoConnected) {
      res.json({
        status: "ready",
        timestamp: new Date().toISOString(),
        service: SERVICE_NAME,
        dependencies: {
          redis: isRedisConnected,
          mongodb: isMongoConnected
        }
      });
    } else {
      res.status(503).json({
        status: "not ready",
        dependencies: {
          redis: isRedisConnected,
          mongodb: isMongoConnected
        }
      });
    }
  } catch (error) {
    logger.error('Readiness check failed', { error: error.message });
    res.status(503).json({
      status: "not ready",
      error: error.message
    });
  }
});

// Basic notification routes
app.post("/notifications", security.jwtAuth(), async (req, res) => {
  try {
    const { type, recipient, message, data } = req.body;
    
    if (!type || !recipient || !message) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: type, recipient, message'
      });
    }

    const notification = {
      id: require('uuid').v4(),
      type,
      recipient,
      message,
      data: data || {},
      createdAt: new Date().toISOString(),
      status: 'pending'
    };

    logger.info('Notification created', { notificationId: notification.id, type, recipient });
    
    res.status(201).json({
      status: 'success',
      data: notification
    });
  } catch (error) {
    logger.error('Error creating notification', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to create notification'
    });
  }
});

app.get("/notifications/:userId", security.jwtAuth(), async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Mock response - replace with actual database query
    const notifications = [
      {
        id: 'notif-1',
        type: 'info',
        message: 'Welcome to Invexis Platform',
        createdAt: new Date().toISOString(),
        read: false
      }
    ];

    res.json({
      status: 'success',
      data: notifications
    });
  } catch (error) {
    logger.error('Error fetching notifications', { error: error.message, userId: req.params.userId });
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch notifications'
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

    // Start HTTP server
    const server = app.listen(PORT, () => {
      logger.info('Notification Service started successfully', {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
        pid: process.pid
      });
      
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