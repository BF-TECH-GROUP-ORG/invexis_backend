// websocket-service/src/events/handlers.js
const { redis } = require('../config/shared');
const logger = require('../utils/logger');
const { RoomManager, RateLimiter } = require('../config/scaling');

let roomManager, rateLimiter, cleanupInterval;

const initializeHandlers = (io) => {
  roomManager = new RoomManager(io, redis);
  rateLimiter = new RateLimiter(redis);

  // Start room cleanup interval
  cleanupInterval = setInterval(() => {
    roomManager.cleanup().catch(err => logger.error('Cleanup error:', err));
  }, 3600000); // Every hour
};

const handleJoin = (socket) => {
  socket.on('join', async (rooms = []) => {
    try {
      // Check rate limit
      if (!await rateLimiter.checkLimit(`join:${socket.userId}`)) {
        throw new Error('Rate limit exceeded');
      }

      // Join rooms with scaling constraints
      for (const room of rooms) {
        await roomManager.joinRoom(socket, room);
        logger.debug(`User ${socket.userId} joined ${room}`);
      }
      socket.emit('joined', { rooms, success: true });
    } catch (error) {
      logger.error('Join error:', error);
      socket.emit('error', {
        message: error.message === 'Rate limit exceeded' ?
          'Too many room joins, please wait' :
          'Failed to join rooms'
      });
    }
  });
};

const handleLeave = (socket) => {
  socket.on('leave', async (rooms = []) => {
    try {
      for (const room of rooms) {
        await roomManager.leaveRoom(socket, room);
        logger.debug(`User ${socket.userId} left ${room}`);
      }
      socket.emit('left', { rooms, success: true });
    } catch (error) {
      logger.error('Leave error:', error);
      socket.emit('error', { message: 'Failed to leave rooms' });
    }
  });
};

const handleCustomEvents = (socket) => {
  socket.on('ack', (data) => {
    logger.debug(`Ack from ${socket.userId}:`, data);
  });
};

// Cleanup on shutdown
const cleanup = () => {
  if (cleanupInterval) clearInterval(cleanupInterval);
};

module.exports = { initializeHandlers, handleJoin, handleLeave, handleCustomEvents, cleanup };