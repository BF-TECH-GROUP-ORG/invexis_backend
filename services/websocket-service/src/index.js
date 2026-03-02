const { authenticateToken: apiKeyAuth } = require('/app/shared/middlewares/auth/production-auth'); // Reusing production auth or apiKey logic if available
// For now, we'll keep the existing apiKeyAuth call if it's different, but let's check.
// The existing code uses security.apiKeyAuth(). The user wants "single centralized auth system".
// The existing `security.apiKeyAuth()` seems to be from `shared/security.js`.
// I will instead focus on ensuring the JWT logic in `io.use` uses the same secret as the shared auth.

// To do this effectively, I need to know what `production-auth.js` uses.
// I will verify the content of `production-auth.js` in the next step before editing `websocket-service`.
require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { getLogger } = require('/app/shared/logger');
const HealthChecker = require('/app/shared/health');
const { SecurityManager } = require('/app/shared/security');
const { ErrorHandler } = require('/app/shared/errorHandler');

const app = express();
app.set('trust proxy', true);
const server = http.createServer(app);
const SERVICE_NAME = 'websocket-service';
const {
  initializeHandlers,
  handleJoin,
  handleLeave,
  handleCustomEvents,
  cleanup: cleanupHandlers
} = require('./events/handlers');

// Initialize production modules
// Initialize production modules
const logger = getLogger(SERVICE_NAME);
const healthChecker = new HealthChecker(SERVICE_NAME, {
  redis: false,
  rabbitmq: true,
  timeout: 5000
});
const security = new SecurityManager(SERVICE_NAME);
const errorHandler = new ErrorHandler(SERVICE_NAME);

const { initAdapter } = require('./config/adapter');

// Socket.IO setup
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Initialize Redis adapter for cluster coordination
initAdapter(io);

// Initialize event handlers
initializeHandlers(io);

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Setup security middleware
security.setupSecurity(app);

// Request logging
app.use(logger.requestLogger());

// Health check routes
healthChecker.setupRoutes(app);

// Basic HTTP routes
app.get('/', (req, res) => {
  res.json({
    service: SERVICE_NAME,
    status: 'running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    connections: io.engine.clientsCount
  });
});

app.get('/stats', (req, res) => {
  res.json({
    service: SERVICE_NAME,
    connections: io.engine.clientsCount,
    rooms: Object.keys(io.sockets.adapter.rooms).length,
    timestamp: new Date().toISOString()
  });
});

// WebSocket connection tracking
const activeConnections = new Map();

// Middleware for Handshake Authentication
io.use(async (socket, next) => {
  try {
    const jwt = require('jsonwebtoken');
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    // userId can be extracted from token, but we allow it as a hint for debugging
    const hintedUserId = socket.handshake.auth?.userId || socket.handshake.query?.userId;

    // Centralized Auth: Use JWT_ACCESS_SECRET and consistent verification options
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) {
      logger.error('CRITICAL: JWT_ACCESS_SECRET not configured');
      return next(new Error('Internal server configuration error'));
    }

    // Match production-auth options
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: 'invexis-auth',
      audience: 'invexis-apps'
    });

    socket.userId = decoded.sub || decoded.uid || decoded.userId || decoded.id || hintedUserId;
    socket.user = decoded;
    socket.authenticated = true;

    // Auto-join user room
    socket.join(`user:${socket.userId}`);

    logger.info('Socket authenticated via Handshake', {
      socketId: socket.id,
      userId: socket.userId
    });
    return next();
  } catch (err) {
    logger.warn('Socket handshake authentication failed', { error: err.message });
    // We don't block the connection yet, but we mark as unauthenticated
    socket.authenticated = false;
    return next();
  }
});

// Socket.IO event handlers
io.on('connection', (socket) => {
  logger.info('New WebSocket connection', {
    socketId: socket.id,
    clientIP: socket.handshake.address,
    userAgent: socket.handshake.headers['user-agent'],
    totalConnections: io.engine.clientsCount
  });

  // Store connection info
  activeConnections.set(socket.id, {
    connectedAt: new Date().toISOString(),
    clientIP: socket.handshake.address,
    userAgent: socket.handshake.headers['user-agent']
  });

  // Presence Tracking Component: handle online status on auth
  const markUserOnline = async (userId) => {
    try {
      const { redis } = require('./config/shared');
      // Set key with an expiry to auto-cleanup in case of crash (e.g. 5 minutes)
      // Can be refreshed via pings if needed, but socket disconnect covers normal cases
      await redis.setex(`presence:user:${userId}`, 300, 'online');

      // Optional: Broadcast to company/friends that user is online
      // io.to(`company:${socket.user.companyId}`).emit('user_status', { userId, status: 'online' });
    } catch (err) {
      logger.warn('Failed to mark user online', { error: err.message });
    }
  };

  const markUserOffline = async (userId) => {
    if (!userId) return;
    try {
      const { redis } = require('./config/shared');
      await redis.del(`presence:user:${userId}`);
    } catch (err) {
      logger.warn('Failed to mark user offline', { error: err.message });
    }
  };

  // Authentication (if token is provided after connection)
  socket.on('authenticate', (data) => {
    try {
      const { token } = data;

      if (token) {
        const jwt = require('jsonwebtoken');
        const secret = process.env.JWT_SECRET;
        if (!secret) {
          throw new Error('Server configuration error: JWT_SECRET missing');
        }
        const decoded = jwt.verify(token, secret);

        socket.userId = decoded.userId || decoded.id || data.userId;
        socket.user = decoded;
        socket.authenticated = true;

        // Join user-specific room
        socket.join(`user:${socket.userId}`);

        logger.info('Socket authenticated via Event', {
          socketId: socket.id,
          userId: socket.userId
        });

        socket.emit('authenticated', { ok: true, userId: socket.userId });

        // Presence Tracking Update
        markUserOnline(socket.userId);
      } else {
        socket.emit('authenticated', { ok: false, message: 'Token required' });
      }
    } catch (err) {
      logger.warn('Socket authentication event failed', { error: err.message });
      socket.emit('authenticated', { ok: false, message: 'Invalid token' });
    }
  });

  // Join user-specific rooms automatically and set presence
  if (socket.userId && socket.user) {
    const user = socket.user;
    const companyId = user.companyId || (user.companies && user.companies[0]);
    const shopId = user.shopId || (user.shops && user.shops[0]);
    const role = user.role;
    const departments = user.assignedDepartments || (user.department ? [user.department] : []);

    // 1. Personal Room
    socket.join(`user:${socket.userId}`);

    // 2. Company Room
    if (companyId) socket.join(`company:${companyId}`);

    // 3. Shop Room
    if (shopId) socket.join(`shop:${shopId}`);

    // 4. Role Room
    if (companyId && role) socket.join(`company:${companyId}:role:${role}`);

    // 5. Shop Role Room
    if (companyId && shopId && role) socket.join(`company:${companyId}:shop:${shopId}:role:${role}`);

    // 6. Department Rooms
    if (companyId && departments.length > 0) {
      departments.forEach(dept => socket.join(`company:${companyId}:dept:${dept}`));
    }

    markUserOnline(socket.userId);

    logger.info(`User ${socket.userId} auto-joined rooms`, {
      companyId,
      shopId,
      role,
      departments
    });
  }

  // Use modular handlers
  handleJoin(socket);
  handleLeave(socket);
  handleCustomEvents(socket);

  // REMOVED INSECURE EVENT LISTENERS: notification, order_update, inventory_alert
  // All system events must originate from backend services via RabbitMQ to prevent spoofing.

  // Handle chat messages
  socket.on('chat_message', async (data) => {
    if (socket.authenticated && data.roomId && data.message) {
      // Security: Sender must be a member of the room
      if (!socket.rooms.has(data.roomId)) {
        logger.warn('Unauthorized chat attempt', { userId: socket.userId, roomId: data.roomId });
        return;
      }

      // Rate span: prevent spamming chat
      const { rateLimiter } = require('./events/handlers'); // Need to export or re-init
      // Assuming rateLimiter is accessible or we instanciate a simple one
      const { redis } = require('./config/shared');
      const limitKey = `rate:chat:${socket.userId}`;
      const count = await redis.incr(limitKey);
      if (count === 1) await redis.expire(limitKey, 5); // 5 seconds window
      if (count > 5) { // Max 5 messages per 5 seconds
        socket.emit('error', { message: 'Chat rate limit exceeded. Please wait.' });
        return;
      }

      logger.info('Chat message sent', {
        socketId: socket.id,
        userId: socket.userId,
        roomId: data.roomId,
        messageLength: data.message.length
      });

      io.to(data.roomId).emit('chat_message', {
        userId: socket.userId,
        message: data.message,
        timestamp: new Date().toISOString(),
        messageId: require('uuid').v4()
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', (reason) => {
    logger.info('WebSocket disconnected', {
      socketId: socket.id,
      userId: socket.userId,
      reason: reason,
      duration: activeConnections.get(socket.id) ?
        Date.now() - new Date(activeConnections.get(socket.id).connectedAt).getTime() : 0,
      totalConnections: io.engine.clientsCount
    });

    // Presence Tracking Update
    if (socket.userId) {
      markUserOffline(socket.userId);
    }

    activeConnections.delete(socket.id);
  });

  // Handle errors
  socket.on('error', (error) => {
    logger.error('Socket error', {
      socketId: socket.id,
      userId: socket.userId,
      error: error.message,
      stack: error.stack
    });
  });
});


// HTTP API for broadcasting
app.post('/broadcast', security.apiKeyAuth(), (req, res) => {
  try {
    const { event, data, room } = req.body;

    if (!event || !data) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: event, data'
      });
    }

    if (room) {
      io.to(room).emit(event, data);
      logger.info('Broadcast sent to room', { event, room, dataKeys: Object.keys(data) });
    } else {
      io.emit(event, data);
      logger.info('Broadcast sent to all connections', { event, dataKeys: Object.keys(data) });
    }

    res.json({
      status: 'success',
      message: 'Broadcast sent successfully',
      connections: io.engine.clientsCount
    });
  } catch (error) {
    logger.error('Broadcast error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to send broadcast'
    });
  }
});

app.post('/notify-user', security.apiKeyAuth(), (req, res) => {
  try {
    const { userId, notification } = req.body;

    if (!userId || !notification) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: userId, notification'
      });
    }

    io.to(`user:${userId}`).emit('notification', {
      ...notification,
      timestamp: new Date().toISOString()
    });

    logger.info('User notification sent', { userId, notification });

    res.json({
      status: 'success',
      message: 'Notification sent successfully'
    });
  } catch (error) {
    logger.error('User notification error', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to send notification'
    });
  }
});

// Error handling
errorHandler.setupErrorHandlers(app);

// Start Worker function
const startWorker = async () => {
  const PORT = process.env.PORT || 9002;
  return new Promise((resolve) => {
    server.listen(PORT, () => {
      logger.info('WebSocket Service started successfully', {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
        pid: process.pid
      });

      console.log(`🔌 WebSocket Service running on port ${PORT}`);

      // Start RabbitMQ Consumer
      // Delayed slightly to ensure server is fully ready
      global.consumerTimeout = setTimeout(() => {
        const { startRealtimeConsumer } = require('./consumers/realtime');
        startRealtimeConsumer(io).catch(err => {
          logger.error('Failed to start realtime consumer:', err);
        });
      }, 1000);
      resolve();
    });
  });
};

// Graceful shutdown
const shutdown = async (signal) => {
  logger.info(`Received ${signal}, starting graceful shutdown`);

  // Clear consumer timeout if it hasn't run yet
  if (global.consumerTimeout) {
    clearTimeout(global.consumerTimeout);
  }

  // Close all socket connections
  if (io) {
    io.close();
    logger.info('Socket.IO server closed');
  }

  return new Promise((resolve) => {
    server.close(async (err) => {
      if (err) {
        logger.error('Error closing server', { error: err.message });
      }

      // Close shared dependencies
      const shared = require('./config/shared');
      if (shared.rabbitmq && shared.rabbitmq.close) {
        try { await shared.rabbitmq.close(); } catch (e) { }
      }
      if (shared.redis && shared.redis.close) {
        try { await shared.redis.close(); } catch (e) { }
      }

      logger.info('WebSocket Service shutdown completed');
      if (signal !== 'TEST') {
        process.exit(0);
      }
      resolve();
    });

    if (signal !== 'TEST') {
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    }
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Export for testing
module.exports = { app, server, io, startWorker, shutdown };

// Auto-start if not required as a module
if (require.main === module) {
  startWorker().catch(err => {
    logger.error('Failed to start worker:', err);
    process.exit(1);
  });
}

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