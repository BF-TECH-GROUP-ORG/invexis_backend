// websocket-service/src/config/scaling.js
const logger = require('../utils/logger');

// Simplified rate limiter
class RateLimiter {
  constructor(redis, options = {}) {
    this.redis = redis;
    this.points = options.points || 100;
    this.duration = options.duration || 60;
    this.blockDuration = options.blockDuration || 600;
  }

  async checkLimit(key) {
    const current = await this.redis.incr(`ratelimit:${key}`);
    if (current === 1) {
      await this.redis.expire(`ratelimit:${key}`, this.duration);
    }

    if (current > this.points) {
      await this.redis.setex(`ratelimit:blocked:${key}`, this.blockDuration, '1');
      return false;
    }

    return true;
  }

  async isBlocked(key) {
    return await this.redis.exists(`ratelimit:blocked:${key}`);
  }
}

// Simplified room manager
class RoomManager {
  constructor(io, redis, options = {}) {
    this.io = io;
    this.redis = redis;
    this.maxUsersPerRoom = options.maxUsersPerRoom || 10000;
    this.cleanupInterval = options.cleanupInterval || 3600000; // 1 hour
  }

  async joinRoom(socket, room) {
    const count = await this.redis.scard(`room:${room}`);
    if (count >= this.maxUsersPerRoom) {
      throw new Error('Room is full');
    }

    await this.redis.sadd(`room:${room}`, socket.userId);
    await this.redis.setex(`user:room:${socket.userId}:${room}`, 86400, Date.now());
    socket.join(room);
  }

  async leaveRoom(socket, room) {
    await this.redis.srem(`room:${room}`, socket.userId);
    await this.redis.del(`user:room:${socket.userId}:${room}`);
    socket.leave(room);
  }

  async cleanup() {
    try {
      const rooms = await this.redis.keys('room:*');
      for (const room of rooms) {
        const users = await this.redis.smembers(room);
        for (const user of users) {
          const roomName = room.slice(5);
          const active = await this.redis.exists(`user:room:${user}:${roomName}`);
          if (!active) {
            await this.redis.srem(room, user);
          }
        }
      }
    } catch (err) {
      logger.error('Room cleanup error:', err);
    }
  }
}

module.exports = {
  RateLimiter,
  RoomManager
};