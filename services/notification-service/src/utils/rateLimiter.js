// src/utils/rateLimiter.js
const redisClient = require("/app/shared/redis");
const logger = require("./logger");

/**
 * Rate limiter using Redis
 * Tracks requests per company and per user
 */
class RateLimiter {
  constructor() {
    this.limits = {
      email: { points: 100, duration: 60 }, // 100 emails per minute per company
      sms: { points: 10, duration: 60 }, // 10 SMS per minute per company
      push: { points: 500, duration: 60 }, // 500 push per minute per company
      user: { points: 20, duration: 60 }, // 20 notifications per minute per user
    };
  }

  /**
   * Check if request is allowed for a channel/company
   */
  async checkChannelLimit(channel, companyId) {
    const key = `rl:${channel}:${companyId}`;
    const limit = this.limits[channel];

    if (!limit) {
      logger.warn(`Unknown channel for rate limiting: ${channel}`);
      return true;
    }

    try {
      const current = await redisClient.get(key);
      const count = current ? parseInt(current) : 0;

      if (count >= limit.points) {
        logger.warn(`Rate limit exceeded for ${channel}/${companyId}`);
        return false;
      }

      // Increment counter
      await redisClient.set(key, count + 1, "EX", limit.duration);
      return true;
    } catch (error) {
      logger.error(`Rate limiter error for ${channel}:`, error);
      // Fail open - allow request if Redis is down
      return true;
    }
  }

  /**
   * Check if user has exceeded rate limit
   */
  async checkUserLimit(userId) {
    const key = `rl:user:${userId}`;
    const limit = this.limits.user;

    try {
      const current = await redisClient.get(key);
      const count = current ? parseInt(current) : 0;

      if (count >= limit.points) {
        logger.warn(`User rate limit exceeded: ${userId}`);
        return false;
      }

      await redisClient.set(key, count + 1, "EX", limit.duration);
      return true;
    } catch (error) {
      logger.error(`User rate limiter error:`, error);
      return true;
    }
  }

  /**
   * Get current usage for a channel/company
   */
  async getUsage(channel, companyId) {
    const key = `rl:${channel}:${companyId}`;
    try {
      const current = await redisClient.get(key);
      const limit = this.limits[channel];
      return {
        current: current ? parseInt(current) : 0,
        limit: limit.points,
        remaining: Math.max(0, (limit.points - (current ? parseInt(current) : 0))),
      };
    } catch (error) {
      logger.error(`Error getting rate limit usage:`, error);
      return null;
    }
  }
}

const rateLimiter = new RateLimiter();

async function checkRateLimit(channel, companyId) {
  return rateLimiter.checkChannelLimit(channel, companyId);
}

async function checkUserRateLimit(userId) {
  return rateLimiter.checkUserLimit(userId);
}

module.exports = {
  checkRateLimit,
  checkUserRateLimit,
  rateLimiter,
};

