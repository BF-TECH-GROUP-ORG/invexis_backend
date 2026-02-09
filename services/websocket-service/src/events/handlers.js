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

      // Security Validation: Ensure user has permission to join each requested room
      // Rooms are typically formatted as 'company:ID', 'shop:ID', or 'user:ID'
      const authorizedRooms = [];
      const user = socket.user || {};
      const userId = socket.userId;
      const userCompanyId = user.companyId || (user.companies && user.companies[0]);
      const userShopId = user.shopId || (user.shops && user.shops[0]);

      for (const room of rooms) {
        let isAuthorized = false;

        // 1. Personal Room: user:ID
        if (room === `user:${userId}`) {
          isAuthorized = true;
        }
        // 2. Company Room: company:ID
        else if (room.startsWith('company:')) {
          const roomId = room.split(':')[1];
          if (roomId === userCompanyId || user.role === 'super_admin') {
            isAuthorized = true;
          }
        }
        // 3. Shop Room: shop:ID
        else if (room.startsWith('shop:')) {
          const roomId = room.split(':')[1];
          if (roomId === userShopId || user.role === 'super_admin' || user.role === 'company_admin') {
            isAuthorized = true;
          }
        }
        // 4. Global Broadcast
        else if (room === 'global' || room === 'all_users') {
          // Security: Only super_admin can join global broadcast rooms
          if (user.role === 'super_admin') {
            isAuthorized = true;
          }
        }

        if (isAuthorized) {
          await roomManager.joinRoom(socket, room);
          authorizedRooms.push(room);
          logger.debug(`User ${socket.userId} joined authorized room: ${room}`);
        } else {
          logger.warn(`Unauthorized room join attempt: User ${socket.userId} tried to join ${room}`);
        }
      }

      socket.emit('joined', { rooms: authorizedRooms, success: true });
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