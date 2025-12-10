/**
 * WebSocket Authentication Middleware
 * Supports direct JWT token connections
 * In development mode, allows connections without token
 */
const jwt = require('jsonwebtoken');
const { UnauthorizedError } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * Extract user info from JWT token
 */
const extractUserInfo = (socket) => {
  const auth = socket.handshake.auth || {};
  const headers = socket.handshake.headers;

  // Get JWT token from auth handshake or Authorization header
  const token = auth.token || headers.authorization?.split(' ')[1];

  if (!token) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    return {
      userId: decoded.id || decoded.sub,
      email: decoded.email || null,
      role: decoded.role || 'user',
    };
  } catch (err) {
    logger.warn('JWT verification failed:', err.message);
    return null;
  }
};

/**
 * Authenticate Socket.IO connection
 * In production: requires valid JWT token
 * In development: allows connections without token (for testing)
 */
const authenticateSocket = (socket, next) => {
  try {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const userInfo = extractUserInfo(socket);

    if (!userInfo) {
      // In development, allow connections without token
      if (isDevelopment) {
        logger.warn('No JWT token provided - using development mode');
        socket.userId = `dev-user-${socket.id.substring(0, 8)}`;
        socket.email = 'dev@localhost';
        socket.role = 'user';
        logger.info(`Development socket authenticated: ${socket.userId} - ${socket.id}`);
        return next();
      }

      // In production, require valid JWT token
      logger.warn('No valid JWT token provided');
      return next(new UnauthorizedError('JWT token required'));
    }

    // Attach user info to socket
    socket.userId = userInfo.userId;
    socket.email = userInfo.email;
    socket.role = userInfo.role;

    logger.info(`Authenticated socket: ${socket.userId} - ${socket.id}`);

    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    next(new UnauthorizedError('Authentication failed'));
  }
};

module.exports = { authenticateSocket, extractUserInfo };