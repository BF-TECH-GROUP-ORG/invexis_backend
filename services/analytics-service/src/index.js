require('dotenv').config();
const express = require('express');
const { getLogger } = require('/app/shared/logger');
const HealthChecker = require('/app/shared/health');
const { SecurityManager } = require('/app/shared/security');
const { ErrorHandler } = require('/app/shared/errorHandler');

const app = express();
const PORT = process.env.PORT || 8002;
const SERVICE_NAME = 'analytics-service';

// Initialize production modules
const logger = getLogger(SERVICE_NAME);
const healthChecker = new HealthChecker(SERVICE_NAME, {
  postgresql: true,
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

// Routes
const router = require('./routes/analytics');
app.use('/analytics', router);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: SERVICE_NAME,
    status: 'running',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Error handling
errorHandler.setupErrorHandlers(app);

// Start server
const server = app.listen(PORT, () => {
  logger.info('Analytics Service started successfully', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    pid: process.pid
  });
  
  console.log(`📊 Analytics Service running on port ${PORT}`);
});

// Graceful shutdown
const shutdown = async (signal) => {
  logger.info(`Received ${signal}, starting graceful shutdown`);
  
  server.close(async (err) => {
    if (err) {
      logger.error('Error closing server', { error: err.message });
      process.exit(1);
    }
    
    logger.info('Analytics Service shutdown completed');
    process.exit(0);
  });
  
  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));