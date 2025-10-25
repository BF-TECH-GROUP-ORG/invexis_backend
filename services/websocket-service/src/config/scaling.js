// websocket-service/src/config/scaling.js
const Redis = require('ioredis');
const logger = require('../utils/logger');
const monitoring = require('../utils/monitoring');

// Scaling configuration
const SCALING_CONFIG = {
    redis: {
        maxConnections: 50,         // Maximum Redis connections per instance
        connectionTimeout: 10000,   // 10 seconds
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        maxLoadingRetryTime: 5000,
        clusterRetryStrategy: (times) => {
            const delay = Math.min(100 + times * 2, 2000);
            return delay;
        },
        reconnectOnError: (err) => {
            const targetError = 'READONLY';
            if (err.message.includes(targetError)) {
                // Force reconnect on READONLY error
                return 2;
            }
            return 1;
        },
        autoResendUnfulfilledCommands: true,
        maxRedirections: 16,        // Maximum number of redirections for cluster
        retryDelayOnFailover: 100,  // Time between retries on failover
        retryDelayOnClusterDown: 1000,
        enableOfflineQueue: true,
        connectTimeout: 10000,
        disconnectTimeout: 2000,
    },
    socket: {
        pingTimeout: 20000,        // 20 seconds
        pingInterval: 25000,       // 25 seconds
        maxHttpBufferSize: 1e6,    // 1MB
        transports: ['websocket'], // Prefer WebSocket, fallback to polling
        upgradeTimeout: 10000,     // 10 seconds for WebSocket upgrade
        maxPayload: 1e6,          // 1MB max payload
        allowUpgrades: true,      // Allow transport upgrades
        serveClient: false,       // Don't serve client files
        cookie: false,            // Don't use cookies
        cors: {
            credentials: true,
            methods: ['GET', 'POST'],
            allowedHeaders: ['content-type']
        },
        perMessageDeflate: {     // WebSocket compression
            threshold: 1024,      // Only compress messages larger than 1KB
            zlibInflateOptions: {
                chunkSize: 10 * 1024 // Process in 10KB chunks
            },
            zlibDeflateOptions: {
                level: 6,        // Balanced compression
                memLevel: 8      // Increased memory for better compression
            },
            clientNoContextTakeover: true,
            serverNoContextTakeover: true
        },
        wsEngine: 'ws',         // Use the 'ws' WebSocket engine
        connectTimeout: 10000,   // Connection timeout
        destroyUpgrade: true,    // Clean up upgrade requests
        maxPayload: 100 * 1024, // 100KB max payload
    },
    cluster: {
        enabled: true,
        syncInterval: 1000,     // Sync interval for cluster state
        checkTimeout: 2000,     // Health check timeout
        nodeTimeout: 5000,      // Node timeout
        retries: 3,             // Number of retries for cluster operations
        backoff: {
            min: 1000,          // Minimum backoff time
            max: 10000,         // Maximum backoff time
            factor: 2,          // Backoff factor
            jitter: 0.1         // Jitter factor
        }
    },
    rooms: {
        maxUsersPerRoom: 10000,    // Limit users per room
        userRoomPrefix: 'user:',   // Prefix for user-specific rooms
        roomCleanupInterval: 3600000, // Cleanup every hour
        sharding: {
            enabled: true,
            shards: 128,           // Number of shards
            strategy: 'consistent-hashing'
        },
        persistence: {
            enabled: true,
            ttl: 86400,           // 24 hours
            checkInterval: 300000  // Check every 5 minutes
        },
        backpressure: {
            maxPending: 1000,     // Max pending messages per room
            windowMs: 1000,       // Time window for rate limiting
            maxRate: 100         // Max messages per window
        },
        broadcast: {
            batchSize: 1000,     // Batch size for broadcasts
            batchDelay: 50,      // Delay between batches (ms)
            concurrency: 4       // Concurrent broadcast operations
        }
    },
    rateLimit: {
        points: 100,              // Number of actions
        duration: 60,             // Per 60 seconds
        blockDuration: 600,       // Block for 10 minutes if exceeded
        whitelist: [],           // IPs to whitelist
        blacklist: [],           // IPs to blacklist
        headers: true,           // Send rate limit headers
        skipFailedRequests: true, // Don't count failed requests
        strategies: {
            ip: {
                points: 1000,
                duration: 60
            },
            user: {
                points: 500,
                duration: 60
            },
            global: {
                points: 10000,
                duration: 60
            }
        },
        errorResponseCode: 429,
        draft_polli_ratelimit_headers: true,
        enableDynamicBlacklisting: true,
        maxRequestSizeInBytes: 5000
    },
    monitoring: {
        enabled: true,
        metricsInterval: 10000,   // Collect metrics every 10 seconds
        alertThresholds: {
            memory: 85,           // Alert at 85% memory usage
            cpu: 80,              // Alert at 80% CPU usage
            errors: 50,           // Alert after 50 errors/minute
            latency: 1000         // Alert on >1s latency
        },
        sampling: {
            rate: 0.1,            // Sample 10% of requests
            lifetime: 300000      // Keep samples for 5 minutes
        },
        retention: {
            metricsRetentionDays: 30,
            logsRetentionDays: 7
        }
    },
    security: {
        enabled: true,
        maxConnectionsPerIp: 100,
        maxRoomsPerUser: 50,
        messageRateLimit: 100,    // messages per second
        payloadValidation: true,
        antiSpam: {
            enabled: true,
            maxDuplicates: 5,
            timeWindow: 60000
        },
        dos: {
            enabled: true,
            maxRequestsPerSecond: 1000,
            banTime: 300          // 5 minutes
        }
    },
    optimization: {
        compression: true,
        batchMessages: true,
        batchSize: 100,
        batchTime: 50,           // ms
        gcInterval: 300000,      // 5 minutes
        messageQueueSize: 1000,
        workerThreads: 4
    }
};

// Create Redis connection pool
const createRedisPool = () => {
    const nodes = process.env.REDIS_NODES ?
        JSON.parse(process.env.REDIS_NODES) :
        [{ host: process.env.REDIS_HOST || 'localhost', port: process.env.REDIS_PORT || 6379 }];

    // For cluster mode
    if (nodes.length > 1) {
        return new Redis.Cluster(nodes, {
            ...SCALING_CONFIG.redis,
            scaleReads: 'slave',        // Read from replicas
            natMap: process.env.REDIS_NAT_MAP ? JSON.parse(process.env.REDIS_NAT_MAP) : undefined,
            redisOptions: {
                password: process.env.REDIS_PASSWORD,
                tls: process.env.REDIS_TLS === 'true' ? {} : undefined
            }
        });
    }

    // Single node mode
    return new Redis({
        ...SCALING_CONFIG.redis,
        host: nodes[0].host,
        port: nodes[0].port,
        password: process.env.REDIS_PASSWORD,
        tls: process.env.REDIS_TLS === 'true' ? {} : undefined
    });
};

// Rate limiter using Redis
class RateLimiter {
    constructor(redis, options = SCALING_CONFIG.rateLimit) {
        this.redis = redis;
        this.options = options;
    }

    async checkLimit(key) {
        const current = await this.redis.incr(`ratelimit:${key}`);
        if (current === 1) {
            await this.redis.expire(`ratelimit:${key}`, this.options.duration);
        }

        if (current > this.options.points) {
            await this.redis.setex(`ratelimit:blocked:${key}`,
                this.options.blockDuration, '1');
            return false;
        }

        return true;
    }

    async isBlocked(key) {
        return await this.redis.exists(`ratelimit:blocked:${key}`);
    }
}

// Room manager for handling large numbers of rooms
class RoomManager {
    constructor(io, redis, options = SCALING_CONFIG.rooms) {
        this.io = io;
        this.redis = redis;
        this.options = options;
    }

    async joinRoom(socket, room) {
        const count = await this.redis.scard(`room:${room}`);
        if (count >= this.options.maxUsersPerRoom) {
            throw new Error('Room is full');
        }

        await this.redis.sadd(`room:${room}`, socket.userId);
        await this.redis.setex(`user:room:${socket.userId}:${room}`,
            86400, Date.now()); // 24h TTL

        socket.join(room);
    }

    async leaveRoom(socket, room) {
        await this.redis.srem(`room:${room}`, socket.userId);
        await this.redis.del(`user:room:${socket.userId}:${room}`);
        socket.leave(room);
    }

    async cleanup() {
        const rooms = await this.redis.keys('room:*');
        for (const room of rooms) {
            const users = await this.redis.smembers(room);
            for (const user of users) {
                const active = await this.redis.exists(`user:room:${user}:${room.slice(5)}`);
                if (!active) {
                    await this.redis.srem(room, user);
                }
            }
        }
    }
}

// Socket.IO configuration for high scale
const configureSocketIO = (io) => {
    io.adapter(require('socket.io-redis')({
        pubClient: createRedisPool(),
        subClient: createRedisPool()
    }));

    // Configure for high scale
    io.sockets.setMaxListeners(0);
    io.engine.setMaxListeners(0);

    return {
        ...SCALING_CONFIG.socket,
        adapter: io.adapter()
    };
};

module.exports = {
    SCALING_CONFIG,
    createRedisPool,
    RateLimiter,
    RoomManager,
    configureSocketIO
};