// websocket-service/src/cluster.js (new: Master cluster script)
const cluster = require('cluster');
const os = require('os');
const logger = require('./utils/logger');
const { initShared } = require('./config/shared');
require('dotenv').config();

const numCPUs = parseInt(process.env.CLUSTER_WORKERS) || os.cpus().length;
const isProduction = process.env.NODE_ENV === 'production';

if (cluster.isMaster) {
    logger.info(`Master ${process.pid} starting cluster with ${numCPUs} workers`);

    // Leader election simulation: Master is always "alive" leader
    // In HA, use Redis for leader election with heartbeats
    setInterval(async () => {
        // Heartbeat to Redis
        await require('./config/shared').redis.set(`ws_leader:${process.pid}`, Date.now(), 'EX', 30); // 30s TTL
        logger.debug(`Master heartbeat sent`);
    }, 10000);

    // Fork workers
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    // Restart workers on exit
    cluster.on('exit', (worker, code, signal) => {
        logger.warn(`Worker ${worker.process.pid} died (${code || signal}). Restarting...`);
        cluster.fork();
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
        logger.info('Master shutting down...');
        for (const id in cluster.workers) {
            cluster.workers[id].kill('SIGINT');
        }
        setTimeout(() => process.exit(0), 5000);
    });

} else {
    // Workers run the server
    require('./index');
}