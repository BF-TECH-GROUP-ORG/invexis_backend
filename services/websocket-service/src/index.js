// websocket-service production-ready index.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { getLogger } = require('/app/shared/logger');
const HealthChecker = require('/app/shared/health');
const { SecurityManager } = require('/app/shared/security');
const { ErrorHandler } = require('/app/shared/errorHandler');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 9002;
const SERVICE_NAME = 'websocket-service';

// Initialize production modules
const logger = getLogger(SERVICE_NAME);
const healthChecker = new HealthChecker(SERVICE_NAME, {
  redis: true,
  rabbitmq: true,
  timeout: 5000
});
const security = new SecurityManager(SERVICE_NAME);
const errorHandler = new ErrorHandler(SERVICE_NAME);

// Socket.IO setup
const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

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

  // Authentication (if token is provided)
  socket.on('authenticate', (data) => {
    try {
      const { token, userId } = data;
      
      if (token && userId) {
        // Verify JWT token here
        socket.userId = userId;
        socket.authenticated = true;
        
        // Join user-specific room
        socket.join(`user-${userId}`);
        
        logger.info('Socket authenticated', {
          socketId: socket.id,
          userId: userId
        });
        
        socket.emit('authenticated', { success: true, userId });
      } else {
        socket.emit('authentication_error', { error: 'Missing token or userId' });
      }
    } catch (error) {
      logger.error('Authentication error', {
        socketId: socket.id,
        error: error.message
      });
      socket.emit('authentication_error', { error: 'Authentication failed' });
    }
  });

  // Join room
  socket.on('join_room', (roomId) => {
    if (roomId) {
      socket.join(roomId);
      logger.info('Socket joined room', {
        socketId: socket.id,
        roomId: roomId,
        userId: socket.userId
      });
      socket.emit('room_joined', { roomId });
    }
  });

  // Leave room
  socket.on('leave_room', (roomId) => {
    if (roomId) {
      socket.leave(roomId);
      logger.info('Socket left room', {
        socketId: socket.id,
        roomId: roomId,
        userId: socket.userId
      });
      socket.emit('room_left', { roomId });
    }
  });

  // Handle custom events
  socket.on('notification', (data) => {
    logger.info('Notification event received', {
      socketId: socket.id,
      userId: socket.userId,
      data: data
    });
    
    // Broadcast to authenticated users
    if (socket.authenticated && data.recipient) {
      io.to(`user-${data.recipient}`).emit('notification', {
        type: data.type || 'info',
        message: data.message,
        timestamp: new Date().toISOString(),
        from: socket.userId
      });
    }
  });

  // Handle order updates
  socket.on('order_update', (data) => {
    logger.info('Order update event received', {
      socketId: socket.id,
      userId: socket.userId,
      orderId: data.orderId
    });
    
    // Broadcast to relevant users (seller, buyer, admins)
    if (data.orderId && data.status) {
      io.emit('order_status_change', {
        orderId: data.orderId,
        status: data.status,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Handle inventory alerts
  socket.on('inventory_alert', (data) => {
    logger.info('Inventory alert event received', {
      socketId: socket.id,
      productId: data.productId,
      level: data.level
    });
    
    // Broadcast to relevant users
    if (data.productId && data.level !== undefined) {
      io.emit('inventory_low', {
        productId: data.productId,
        currentLevel: data.level,
        threshold: data.threshold || 10,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Handle chat messages
  socket.on('chat_message', (data) => {
    if (socket.authenticated && data.roomId && data.message) {
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

    io.to(`user-${userId}`).emit('notification', {
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

// Start server
server.listen(PORT, () => {
  logger.info('WebSocket Service started successfully', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    pid: process.pid
  });
  
  console.log(`🔌 WebSocket Service running on port ${PORT}`);
});

// Graceful shutdown
const shutdown = async (signal) => {
  logger.info(`Received ${signal}, starting graceful shutdown`);
  
  // Close all socket connections
  io.close(() => {
    logger.info('Socket.IO server closed');
  });
  
  server.close(async (err) => {
    if (err) {
      logger.error('Error closing server', { error: err.message });
      process.exit(1);
    }
    
    logger.info('WebSocket Service shutdown completed');
    process.exit(0);
  });
  
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

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