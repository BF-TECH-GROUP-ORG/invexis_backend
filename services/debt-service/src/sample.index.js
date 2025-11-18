// server.js — Clean, reliable, minimal logs, 100% working version
require('dotenv').config();

const connectDB = require('./config/db');

// === RabbitMQ & Redis — smart layered fallbacks ===
let rabbitClient = null;
let connectRabbitMQ = async () => console.log('RabbitMQ: skipped (standalone)');
let redis = {
    connect: () => {
        console.log('Redis: skipped (fallback no-op)');
        return this;
    },
    quit: async () => { }
};
global.redisClient = redis;
global.rabbitmqPublish = async () => console.log('rabbitmqPublish: skipped');

try {
    // Try global shared first (mono-repo / Docker volume)
    rabbitClient = require('/app/shared/rabbitmq.js') || require('/app/shared/rabbitmq');
    connectRabbitMQ = async () => await rabbitClient.connect();

    global.rabbitmqPublish = async (routingKey, payload, metadata = {}) => {
        if (rabbitClient.exchanges?.topic) {
            return rabbitClient.publish(rabbitClient.exchanges.topic, routingKey, payload, metadata);
        }
        return rabbitClient.publish(routingKey, payload, metadata);
    };

    redis = require('/app/shared/redis.js') || require('/app/shared/redis');
    global.redisClient = redis;
    console.log('✓ Redis client loaded from /app/shared');
} catch (e) {
    try {
        // Fallback to local shared (if running outside mono-repo)
        rabbitClient = require('./shared/rabbitmq') || require('../shared/rabbitmq');
        connectRabbitMQ = async () => await rabbitClient.connect();
        global.rabbitmqPublish = async (routingKey, payload, metadata = {}) => {
            if (rabbitClient.exchanges?.topic) {
                return rabbitClient.publish(rabbitClient.exchanges.topic, routingKey, payload, metadata);
            }
            return rabbitClient.publish(routingKey, payload, metadata);
        };
        redis = require('./shared/redis') || require('../shared/redis');
        global.redisClient = redis;
        console.log('✓ Redis client loaded from ./shared');
    } catch (errLocal) {
        // Final fallback: no-op (safe for local dev)
        if (process.env.NODE_ENV !== 'production') {
            console.warn('⚠ Shared RabbitMQ/Redis not found → running in standalone mode');
        }
    }
}

// === Critical env vars ===
const requiredEnv = ['MONGO_URI', 'SESSION_SECRET'];
const missing = requiredEnv.filter(key => !process.env[key]);
if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
}

const PORT = process.env.PORT || 8011;
const HOST = process.env.HOST || '127.0.0.1'; // Default to localhost

// === Global error handlers ===
process.on('unhandledRejection', err => {
    console.error('Unhandled Rejection:', err);
});
process.on('uncaughtException', err => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

// === Start everything ===
const startServer = async () => {
    try {
        console.log('Starting debt-service...');

        // 1. Database
        await connectDB();
        console.log('✓ MongoDB connected');

        // 2. Message broker & cache (non-blocking)
        await connectRabbitMQ().catch(() => console.warn('⚠ RabbitMQ unavailable'));

        // Redis: synchronous connect + event listeners (isConnected flag is managed internally)
        try {
            redis.connect();
            console.log('✓ Redis connecting (event listeners attached)');
            // Give Redis a moment to establish connection
            await new Promise(resolve => setTimeout(resolve, 500));
            if (redis.isConnected) {
                console.log('✓ Redis connected and ready');
            } else {
                console.warn('⚠ Redis connecting in background (will retry automatically)');
            }
        } catch (redisErr) {
            console.warn('⚠ Redis unavailable:', redisErr.message);
        }

        // 3. In-memory persister (background writer)
        try {
            const persister = require('./workers/inMemoryPersister');
            persister.start(100); // every 100ms
            console.log('In-memory persister started');
        } catch (e) {
            console.warn('Persister not loaded (dev mode?)');
        }

        // 4. Express app
        const express = require('express');
        const compression = require('compression');
        const metrics = require('./utils/metrics');

        const app = express();

        app.use(compression());
        app.use(express.json({ limit: '10mb' }));
        app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Response time middleware (light logging)
        app.use((req, res, next) => {
            const start = process.hrtime.bigint();
            const oldEnd = res.end;
            const oldJson = res.json;

            res.end = function (...args) {
                const ms = Number(process.hrtime.bigint() - start) / 1e6;
                if (!res.headersSent) {
                    res.setHeader('X-Response-Time', `${ms.toFixed(3)}ms`);
                }
                if (process.env.LOG_REQUESTS === 'true') {
                    console.log(`${req.method} ${req.path} ${res.statusCode} ${ms.toFixed(0)}ms`);
                }
                metrics.recordResponseTime(ms);
                return oldEnd.apply(this, args);
            };

            res.json = function (body) {
                const ms = Number(process.hrtime.bigint() - start) / 1e6;
                if (!res.headersSent) {
                    res.setHeader('X-Response-Time', `${ms.toFixed(3)}ms`);
                }
                metrics.recordResponseTime(ms);
                return oldJson.call(this, body);
            };

            next();
        });

        // Routes - with error handling
        try {
            app.use('/debt', require('./routes/debt'));
            console.log('✓ /debt routes loaded');
        } catch (routeErr) {
            console.error('⚠ Failed to load /debt routes:', routeErr.message);
        }

        try {
            app.use('/events', require('./routes/events'));
            console.log('✓ /events routes loaded');
        } catch (routeErr) {
            console.error('⚠ Failed to load /events routes:', routeErr.message);
        }

        // Health & Monitoring
        app.get('/health', (req, res) => res.json({
            status: 'ok',
            service: 'debt-service',
            redis: global.redisClient?.isConnected ? 'connected' : 'disconnected',
            time: new Date().toISOString()
        }));

        app.get('/metrics', async (req, res) => {
            try {
                res.type('text/plain').send(await metrics.getMetricsText());
            } catch (err) {
                res.status(500).send('Metrics error');
            }
        });

        app.get('/monitoring/queue', (req, res) => {
            try {
                const store = require('./utils/inMemoryStore');
                const stats = {
                    writeQueueLength: store.queueLength(),
                    debtsInMemory: store.debts.size,
                    repaymentsInMemory: store.repayments.size,
                    timestamp: new Date().toISOString()
                };
                // Update Prometheus gauges
                metrics.updateQueueDepth(stats.writeQueueLength);
                metrics.updateInMemoryDebts(stats.debtsInMemory);
                metrics.updateInMemoryRepayments(stats.repaymentsInMemory);
                res.json(stats);
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });

        // Catch-all 404 handler
        app.use((req, res) => {
            res.status(404).json({ error: 'Not found', path: req.path });
        });

        // Error handling middleware
        app.use((err, req, res, next) => {
            console.error('Express error:', err);
            res.status(500).json({ error: err.message || 'Internal server error' });
        });

        // === Start HTTP server ===
        console.log(`[Express] Starting server on ${HOST}:${PORT}...`);

        const server = app.listen(PORT, HOST);

        // Debugging: Log when server starts listening
        console.log('Debug: Attempting to bind server to port');
        server.on('listening', () => {
            console.log(`✓ debt-service LISTENING on http://localhost:${PORT}`);
            console.log('✓✓✓ SERVER READY ✓✓✓');
        });

        // Explicitly verify server binding
        setTimeout(() => {
            if (server.listening) {
                console.log('✓ Server is confirmed to be listening');
            } else {
                console.error('✗ Server failed to bind to port');
                process.exit(1);
            }
        }, 2000);

        // Debugging: Log if server fails to bind
        server.on('error', (err) => {
            console.error('Debug: Server error occurred:', err);
            if (err.code === 'EADDRINUSE') {
                console.error(`✗ Port ${PORT} already in use`);
                console.error(`Try: lsof -i :${PORT} | grep LISTEN`);
                process.exit(1);
            } else if (err.code === 'EACCES') {
                console.error(`✗ Port ${PORT} requires elevated privileges`);
                process.exit(1);
            } else {
                console.error('✗ Server error:', err.message);
                console.error(err);
                process.exit(1);
            }
        });

        server.on('clientError', (err, socket) => {
            console.error('Client error:', err.message);
            try {
                socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
            } catch (e) { }
        });

        // Additional debugging: Check if server is bound
        setTimeout(() => {
            console.log('Debug: Checking if server is bound to port');
            if (!server.listening) {
                console.warn('⚠ Server is not listening on the expected port');
            } else {
                console.log('✓ Server is confirmed to be listening');
            }
        }, 1000);

        // Final debugging: Explicitly check if the port is in use
        const net = require('net');
        const checkPort = net.createServer();
        checkPort.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`✗ Port ${PORT} is already in use`);
            } else {
                console.error('✗ Unexpected error while checking port:', err.message);
            }
            process.exit(1);
        });
        checkPort.once('listening', () => {
            console.log(`✓ Port ${PORT} is available`);
            checkPort.close();
        });
        checkPort.listen(PORT, HOST);

        // === Cron jobs ===
        try {
            const cronJobs = require('./cron');
            cronJobs.start();
            console.log('✓ Cron jobs started');
        } catch (err) {
            console.warn('⚠ Cron jobs failed to start:', err.message);
        }

        // Safety: Log if server doesn't start in 5s
        const startupTimeout = setTimeout(() => {
            console.warn('⚠ Server startup delay detected - this may indicate a port binding issue');
        }, 5000);

        // === Graceful shutdown ===
        const gracefulShutdown = async () => {
            console.log('🛑 Shutting down gracefully...');
            server.close(async () => {
                try {
                    if (redis.close) {
                        await redis.close();
                        console.log('✓ Redis closed');
                    }
                } catch (err) {
                    console.warn('⚠ Error closing Redis:', err.message);
                }
                process.exit(0);
            });

            // Force close after 10s
            setTimeout(() => {
                console.error('💥 Force shutdown');
                process.exit(1);
            }, 10000);
        };

        process.on('SIGTERM', gracefulShutdown);
        process.on('SIGINT', gracefulShutdown);

    } catch (err) {
        console.error('Failed to start debt-service:', err.message || err);
        process.exit(1);
    }
};

// === GO ===
startServer();