// websocket-service/src/middleware/auth.js (unchanged)
const { UnauthorizedError } = require('../utils/errors');
const logger = require('../utils/logger');

const authenticateSocket = (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];

    if (!token) {
        logger.warn('No auth token provided');
        return next(new UnauthorizedError('Authentication token required'));
    }

    try {
        // Placeholder: Decode/verify token
        socket.userId = token; // Mock for dev
        socket.companyId = 'test-company';
        socket.roles = ['user'];
        logger.info(`Authenticated socket: ${socket.userId} (cluster worker)`);
        next();
    } catch (error) {
        logger.error('Auth failed:', error);
        next(new UnauthorizedError('Invalid token'));
    }
};

module.exports = { authenticateSocket };