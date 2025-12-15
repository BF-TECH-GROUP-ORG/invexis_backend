// auth-service production-ready index.js
// Suppress dotenv tips
process.env.DOTENV_CONFIG_SILENT = 'true';
require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');
const { getLogger } = require('/app/shared/logger');
const HealthChecker = require('/app/shared/health');
const { SecurityManager } = require('/app/shared/security');
const { ErrorHandler } = require('/app/shared/errorHandler');

let connectRabbitMQ, redis;

try {
    const rabbitmq = require('/app/shared/rabbitmq.js');
    connectRabbitMQ = rabbitmq.connect;
    redis = require('/app/shared/redis.js');
} catch (err) {
    console.warn('Shared dependencies not available, running in standalone mode');
    connectRabbitMQ = async () => console.log('RabbitMQ connection skipped');
    redis = {
        connect: async () => console.log('Redis connection skipped'),
        quit: async () => console.log('Redis quit skipped')
    };
}

const PORT = process.env.PORT || 8001;
const SERVICE_NAME = 'auth-service';

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

// Setup health check routes
healthChecker.setupRoutes(app);

// Validate required environment variables
const requiredVars = [
    'DB_MONGO',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'SESSION_SECRET',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET'
];

const missingVars = requiredVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
    logger.error('Missing required environment variables', { missingVars });
    console.error(`Missing environment variables: ${missingVars.join(', ')}`);
    process.exit(1);
}

const startServer = async () => {
    let retries = 5;
    while (retries > 0) {
        try {
            logger.info('Attempting to connect to services', { attempt: 6 - retries });
            
            // Connect to MongoDB
            await connectDB();
            logger.info('MongoDB connected successfully');

            // Connect to RabbitMQ
            await connectRabbitMQ();
            logger.info('RabbitMQ connected successfully');
            
            try {
                const { startConsumers } = require('./events/consumer');
                await startConsumers();
                logger.info('Event consumers started');
            } catch (consumerError) {
                logger.warn('Event consumers failed to start', { error: consumerError.message });
            }

            // Connect to Redis
            await redis.connect();
            logger.info('Redis connected successfully');

            // Start HTTP server
            const server = app.listen(PORT, () => {
                logger.info('Auth Service started successfully', {
                    port: PORT,
                    environment: process.env.NODE_ENV || 'development',
                    nodeVersion: process.version,
                    pid: process.pid
                });
                console.log(`🔐 Auth Service running on port ${PORT}`);
                console.log(`📍 Environment: ${process.env.NODE_ENV || "development"}`);
            });

            // Enhanced graceful shutdown
            const shutdown = async (signal) => {
                logger.info(`Received ${signal}, starting graceful shutdown`);
                
                server.close(async (err) => {
                    if (err) {
                        logger.error('Error closing server', { error: err.message });
                        process.exit(1);
                    }
                    
                    try {
                        await redis.quit();
                        logger.info('Redis connection closed');
                    } catch (redisError) {
                        logger.warn('Error closing Redis', { error: redisError.message });
                    }
                    
                    logger.info('Auth Service shutdown completed');
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

            break; // Exit retry loop on success

        } catch (error) {
            retries--;
            logger.error('Service startup failed', {
                error: error.message,
                stack: error.stack,
                retriesLeft: retries
            });
            
            if (retries === 0) {
                logger.error('All retry attempts failed, exiting');
                process.exit(1);
            }
            
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
};

// Start the server
startServer().catch((error) => {
    logger.error('Fatal startup error', { error: error.message, stack: error.stack });
    console.error('Fatal error during startup:', error);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Promise Rejection', {
        reason: reason?.message || reason,
        stack: reason?.stack,
        promise: promise
    });
    process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', {
        message: error.message,
        stack: error.stack,
        name: error.name
    });
    process.exit(1);
});