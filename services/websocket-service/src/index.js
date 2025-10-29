// websocket-service/src/index.js
require('dotenv').config();
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { initAdapter } = require('./config/adapter');
const logger = require('./utils/logger');
const cluster = require('node:cluster');
const { healthCheck } = require('./config/shared');
const { authenticateSocket } = require('./middleware/auth');
const { handleJoin, handleLeave, handleCustomEvents } = require('./events/handlers');
const { startRealtimeConsumer } = require('./consumers/realtime');

let connectRabbitMQ, redis;

try {
    const rabbitmq = require('/app/shared/rabbitmq.js');
    connectRabbitMQ = rabbitmq.connect;
    redis = require('/app/shared/redis.js');
} catch (err) {
    console.warn('Shared dependencies not available, running in standalone mode');
    connectRabbitMQ = async () => console.log('RabbitMQ connection skipped');
    redis = {
        connect: async () => console.log('Redis connection skipped'),
        quit: async () => console.log('Redis quit skipped')
    };
}

const app = express();
const server = createServer(app);

// Security & perf middleware
app.use(helmet());
app.use(compression());
app.use(cors({ origin: process.env.CORS_ORIGINS.split(',') }));

const { configureSocketIO, SCALING_CONFIG } = require('./config/scaling');

const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGINS.split(','),
        methods: ['GET', 'POST'],
        credentials: true
    },
    ...SCALING_CONFIG.socket
});

// Configure Socket.IO for high scale
configureSocketIO(io);

// Adapter for cluster
// Adapter for cluster will be initialized after shared services are ready
// (moved into startWorker to ensure Redis client exists)

// Auth middleware
io.use(authenticateSocket);

// Socket handlers
io.on('connection', (socket) => {
    logger.info(`Worker ${process.pid}: New connection ${socket.id} (user: ${socket.userId})`);

    handleJoin(socket);
    handleLeave(socket);
    handleCustomEvents(socket);

    socket.on('disconnect', (reason) => {
        logger.info(`Worker ${process.pid}: Disconnect ${socket.id}: ${reason}`);
    });

    socket.emit('connected', { userId: socket.userId, socketId: socket.id, worker: process.pid });
});

app.get('/', (req, res) => {
    res.send('Websocket Service is mounted to gateway.');
});

// Health endpoint (cluster-aware)
app.get('/health', async (req, res) => {
    const sharedHealth = await healthCheck();
    const clusterInfo = cluster.isWorker ? { workerId: process.pid, primaryId: cluster.isPrimary ? process.pid : 'N/A' } : { primaryId: process.pid };
    res.json({
        status: 'ok',
        connectedClients: io.engine.clientsCount,
        ...sharedHealth,
        ...clusterInfo,
        timestamp: new Date().toISOString()
    });
});

const PORT = process.env.PORT || 9002;

const startWorker = async () => {
    let retries = 5;
    while (retries > 0) {
        try {
            console.log('Attempting to connect to services...');

            // Connect to Redis
            if (redis && typeof redis.connect === 'function') {
                await redis.connect();
                console.log('redis connected');
            }

            // Connect to RabbitMQ
            console.log('RabbitMQ: Attempting connection...');
            await rabbitmq.connect();

            // Initialize Socket.IO Redis adapter
            try {
                initAdapter(io);
            } catch (err) {
                logger.error('Failed to initialize Socket.IO adapter:', err.message);
                throw err;
            }

            // Start realtime consumer
            await startRealtimeConsumer(io);

            // Start HTTP server (bind to all interfaces for LB)
            server.listen(PORT, '0.0.0.0', () => {
                console.log(`Websocket service running on port ${PORT} - Cached & Event-ready`);
            });

            return; // Success - exit the retry loop
        } catch (error) {
            logger.error(`Startup attempt failed: ${error.message}`);
            retries--;

            if (retries === 0) {
                logger.error('Maximum retries reached. Exiting...');
                throw error;
            }

            logger.info(`Retrying in 5 seconds... (${retries} attempts remaining)`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
};

// Graceful shutdown handler
const shutdown = async () => {
    console.log('Graceful shutdown initiated...');
    try {
        // Close all Socket.IO connections
        if (io) {
            const sockets = await io.fetchSockets();
            for (const socket of sockets) {
                socket.disconnect(true);
            }
            io.close();
            console.log('All Socket.IO connections closed');
        }

        // Close HTTP server
        server.close(() => {
            console.log('HTTP server closed');
        });

        // Close Redis connection
        if (redis && redis.disconnect) {
            await redis.disconnect();
            console.log('Redis connection closed');
        }

        // Close RabbitMQ connection
        if (rabbitmq && rabbitmq.close) {
            await rabbitmq.close();
            console.log('RabbitMQ connection closed');
        }

        console.log('Graceful shutdown completed');
        process.exit(0);
    } catch (error) {
        console.error(`Shutdown error: ${error.message}`);
        process.exit(1);
    }
};

// Load shared dependencies
let rabbitmq;
try {
    rabbitmq = require('/app/shared/rabbitmq.js');
    redis = require('/app/shared/redis.js');
} catch (err) {
    console.error('Failed to load shared modules:', err);
    process.exit(1);
}

// Start server
if (require.main === module) {
    // Connect to RabbitMQ first, then start worker
    rabbitmq.connect()
        .then(() => {
            console.log('rabbitmq connected');
            return startWorker();
        })
        .catch((err) => {
            console.error('Worker startup failed:', err && err.stack ? err.stack : err);
            process.exit(1);
        });
}

// Listen for termination signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Global error handlers for better observability
process.on('unhandledRejection', (reason, p) => {
    console.error('Unhandled Rejection at:', p, 'reason:', reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err && err.stack ? err.stack : err);
    // attempt graceful shutdown
    shutdown().catch(() => process.exit(1));
});

module.exports = { app, server, io, startWorker }; // For testing