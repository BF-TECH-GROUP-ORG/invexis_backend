/**
 * Socket.IO Client Helper
 * Provides utilities for frontend to connect to websocket service through gateway
 * 
 * Usage:
 * const socket = createSocketConnection('http://localhost:3000', jwtToken);
 */

const io = require('socket.io-client');

/**
 * Create a Socket.IO connection through the gateway
 * @param {string} gatewayUrl - Gateway URL (e.g., 'http://localhost:3000')
 * @param {string} token - JWT authentication token
 * @param {object} options - Additional Socket.IO options
 * @returns {object} Socket.IO client instance
 */
const createSocketConnection = (gatewayUrl, token, options = {}) => {
  const defaultOptions = {
    path: '/socket.io',
    auth: {
      token: token,
    },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
    transports: ['websocket'],
    ...options,
  };

  const socket = io(gatewayUrl, defaultOptions);

  // Connection event handlers
  socket.on('connect', () => {
    console.log('✅ Connected to WebSocket service');
  });

  socket.on('disconnect', (reason) => {
    console.log('❌ Disconnected from WebSocket service:', reason);
  });

  socket.on('error', (error) => {
    console.error('⚠️ WebSocket error:', error);
  });

  socket.on('connect_error', (error) => {
    console.error('⚠️ Connection error:', error);
  });

  return socket;
};

/**
 * Join one or more rooms
 * @param {object} socket - Socket.IO client instance
 * @param {string|array} rooms - Room name(s) to join
 */
const joinRooms = (socket, rooms) => {
  const roomList = Array.isArray(rooms) ? rooms : [rooms];
  socket.emit('join', roomList);
};

/**
 * Leave one or more rooms
 * @param {object} socket - Socket.IO client instance
 * @param {string|array} rooms - Room name(s) to leave
 */
const leaveRooms = (socket, rooms) => {
  const roomList = Array.isArray(rooms) ? rooms : [rooms];
  socket.emit('leave', roomList);
};

/**
 * Subscribe to user-specific events
 * @param {object} socket - Socket.IO client instance
 * @param {string} userId - User ID
 * @param {function} callback - Callback for events
 */
const subscribeToUserEvents = (socket, userId, callback) => {
  const userRoom = `user:${userId}`;
  joinRooms(socket, userRoom);

  // Listen to all user events
  socket.on('user.registered', callback);
  socket.on('user.login', callback);
  socket.on('user.logout', callback);
  socket.on('user.updated', callback);
};

/**
 * Subscribe to notification events
 * @param {object} socket - Socket.IO client instance
 * @param {string} userId - User ID
 * @param {function} callback - Callback for notifications
 */
const subscribeToNotifications = (socket, userId, callback) => {
  const userRoom = `user:${userId}`;
  joinRooms(socket, userRoom);

  socket.on('notification', callback);
  socket.on('notification.read', callback);
  socket.on('notification.deleted', callback);
};

/**
 * Subscribe to room events
 * @param {object} socket - Socket.IO client instance
 * @param {string} roomName - Room name
 * @param {function} callback - Callback for room events
 */
const subscribeToRoom = (socket, roomName, callback) => {
  joinRooms(socket, roomName);
  socket.on(roomName, callback);
};

/**
 * Emit custom event
 * @param {object} socket - Socket.IO client instance
 * @param {string} eventName - Event name
 * @param {object} data - Event data
 */
const emitEvent = (socket, eventName, data) => {
  socket.emit(eventName, data);
};

/**
 * Disconnect socket
 * @param {object} socket - Socket.IO client instance
 */
const disconnect = (socket) => {
  if (socket && socket.connected) {
    socket.disconnect();
  }
};

module.exports = {
  createSocketConnection,
  joinRooms,
  leaveRooms,
  subscribeToUserEvents,
  subscribeToNotifications,
  subscribeToRoom,
  emitEvent,
  disconnect,
};

