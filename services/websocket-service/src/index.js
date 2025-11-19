// websocket-service/src/index.js
require('dotenv').config();
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { initAdapter } = require('./config/adapter');
const logger = require('./utils/logger');
const { redis, rabbitmq, healthCheck } = require('./config/shared');
const { authenticateSocket } = require('./middleware/auth');
const { initializeHandlers, handleJoin, handleLeave, handleCustomEvents } = require('./events/handlers');
const { startRealtimeConsumer } = require('./consumers/realtime');

const app = express();
const server = createServer(app);

// Security & perf middleware
app.use(helmet());
app.use(compression());
app.use(cors({ origin: process.env.CORS_ORIGINS?.split(',') || ['*'] }));

// Socket.IO configuration
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['*'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 20000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6,
  transports: ['websocket'],
  serveClient: false,
  cookie: false
});

// Initialize handlers
initializeHandlers(io);

// Auth middleware - Authenticate all socket connections
io.use(authenticateSocket);

// Socket handlers
io.on('connection', (socket) => {
  logger.info(`New connection ${socket.id} (user: ${socket.userId})`);

  handleJoin(socket);
  handleLeave(socket);
  handleCustomEvents(socket);

  socket.on('disconnect', (reason) => {
    logger.info(`Disconnect ${socket.id}: ${reason}`);
  });

  socket.emit('connected', { userId: socket.userId, socketId: socket.id });
});

app.get('/', (req, res) => {
  res.send('Websocket Service is running');
});

// Health endpoint
app.get('/health', async (req, res) => {
  try {
    const sharedHealth = await healthCheck();
    res.json({
      status: 'ok',
      connectedClients: io.engine.clientsCount,
      ...sharedHealth,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({ status: 'error', error: error.message });
  }
});

const getPort = () => {
  const port = process.env.PORT;
  if (port === '0') return 0; // Dynamic port for testing
  return parseInt(port, 10) || 9002;
};

const startWorker = async () => {
  let retries = 5;
  while (retries > 0) {
    try {
      logger.info('Attempting to connect to services...');

      // Connect to Redis
      if (redis && typeof redis.connect === 'function') {
        await redis.connect();
        logger.info('Redis connected');
      }

      // Connect to RabbitMQ
      logger.info('Connecting to RabbitMQ...');
      await rabbitmq.connect();
      logger.info('RabbitMQ connected');

      // Initialize Socket.IO Redis adapter
      initAdapter(io);

      // Start realtime consumer
      await startRealtimeConsumer(io);

      // Start HTTP server
      const port = getPort();
      return new Promise((resolve, reject) => {
        server.listen(port, '0.0.0.0', () => {
          const actualPort = server.address().port;
          logger.info(`Websocket service running on port ${actualPort}`);
          resolve();
        }).on('error', reject);
      });
    } catch (error) {
      logger.error(`Startup attempt failed: ${error.message}`);
      retries--;

      if (retries === 0) {
        logger.error('Maximum retries reached. Exiting...');
        throw error;
      }

      logger.info(`Retrying in 5 seconds... (${retries} attempts remaining)`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
};

// Graceful shutdown handler
const shutdown = async () => {
  logger.info('Graceful shutdown initiated...');
  try {
    // Close all Socket.IO connections
    if (io) {
      try {
        const sockets = await io.fetchSockets();
        for (const socket of sockets) {
          socket.disconnect(true);
        }
        io.close();
        logger.info('All Socket.IO connections closed');
      } catch (err) {
        logger.warn('Error closing Socket.IO:', err.message);
      }
    }

    // Close HTTP server
    return new Promise((resolve) => {
      if (!server.listening) {
        logger.info('Server not running, skipping close');
        resolve();
        return;
      }

      server.close(() => {
        logger.info('HTTP server closed');
        resolve();
      });

      // Force close after 5 seconds
      setTimeout(() => {
        logger.warn('Force closing server');
        resolve();
      }, 5000);
    });
  } catch (error) {
    logger.error(`Shutdown error: ${error.message}`);
  }
};

// Start server
if (require.main === module) {
  startWorker()
    .then(() => {
      logger.info('Worker started successfully');
    })
    .catch((err) => {
      logger.error('Worker startup failed:', err);
      process.exit(1);
    });
}

// Listen for termination signals
const handleShutdown = async () => {
  try {
    const { cleanup } = require('./events/handlers');
    if (cleanup) cleanup();
    await shutdown();
    process.exit(0);
  } catch (error) {
    logger.error('Shutdown failed:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);

// Global error handlers
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  shutdown().catch(() => process.exit(1));
});

module.exports = { app, server, io, startWorker, shutdown };