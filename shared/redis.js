const Redis = require('ioredis');
require('dotenv').config();

class RedisClient {
    constructor() {
        this.client = null;
        this.subscriber = null;
        this.isConnected = false;
    }

    connect() {
        if (this.client) return this;

        const config = {
            host: process.env.REDIS_HOST || 'redis',
            port: process.env.REDIS_PORT || 6379,
            password: process.env.REDIS_PASSWORD || undefined,
            retryStrategy(times) {
                const delay = Math.min(times * 50, 2000);
                console.warn(`redis reconnect attempt # ${times} in ${delay} ms`);
                return delay;
            }
        };
        this.client = new Redis(config);
        this.subscriber = new Redis(config);

        this.client.on('connect', () => {
            this.isConnected = true;
            console.log('redis connected');
        });

        this.client.on("error", (err) => {
            this.isConnected = false;
            console.error('redis', err.message);
        });

        this.client.on("end", () => {
            this.isConnected = false;
            console.warn("redis connection closed");
        });

        return this;
    }

    async set(key, value, mode = "EX", duration = 60) {
        try {
            return await this.client.set(key, value, mode, duration);
        } catch (err) {
            console.error("redis SET error", err.message);
            throw err;
        }
    }

    async get(key) {
        try {
            return await this.client.get(key);
        } catch (err) {
            console.error("Redis GET error", err.message);
            return null;  // Return null on error for graceful handling
        }
    }

    async del(key) {
        try {
            return await this.client.del(key);
        } catch (err) {
            console.error("Redis DEL error", err.message);
            throw err;
        }
    }

    async incr(key) {
        try {
            return await this.client.incr(key);
        } catch (err) {
            console.error("Redis INCR error", err.message);
            throw err;
        }
    }

    async expire(key, seconds) {
        try {
            return await this.client.expire(key, seconds);
        } catch (err) {
            console.error("Redis EXPIRE error", err.message);
            throw err;
        }
    }

    async setex(key, seconds, value) {
        try {
            return await this.client.setex(key, seconds, value);
        } catch (err) {
            console.error("Redis SETEX error", err.message);
            throw err;
        }
    }

    async exists(key) {
        try {
            return await this.client.exists(key);
        } catch (err) {
            console.error("Redis EXISTS error", err.message);
            return 0;
        }
    }

    async sadd(key, ...members) {
        try {
            return await this.client.sadd(key, ...members);
        } catch (err) {
            console.error("Redis SADD error", err.message);
            throw err;
        }
    }

    async srem(key, ...members) {
        try {
            return await this.client.srem(key, ...members);
        } catch (err) {
            console.error("Redis SREM error", err.message);
            throw err;
        }
    }

    async scard(key) {
        try {
            return await this.client.scard(key);
        } catch (err) {
            console.error("Redis SCARD error", err.message);
            return 0;
        }
    }

    async smembers(key) {
        try {
            return await this.client.smembers(key);
        } catch (err) {
            console.error("Redis SMEMBERS error", err.message);
            return [];
        }
    }

    async keys(pattern) {
        try {
            return await this.client.keys(pattern);
        } catch (err) {
            console.error("Redis KEYS error", err.message);
            return [];
        }
    }

    async publish(channel, message) {
        try {
            return await this.client.publish(channel, message);
        } catch (err) {
            console.error("Redis PUBLISH error", err.message);
            throw err;
        }
    }

    async subscribe(channel, callback) {
        try {
            await this.subscriber.subscribe(channel);
            this.subscriber.on("message", (chan, message) => {
                if (chan === channel) {
                    callback(message);
                }
            });
        } catch (err) {
            console.error("error subscribing", err.message);
            throw err;
        }
    }

    async close() {
        try {
            if (this.client) await this.client.quit();
            if (this.subscriber) await this.subscriber.quit();
        } catch (err) {
            console.error("Redis CLOSE error", err.message);
        }
    }
}

const redisInstance = new RedisClient().connect();

process.on("SIGINT", () => redisInstance.close());
process.on("SIGTERM", () => redisInstance.close());

module.exports = redisInstance;