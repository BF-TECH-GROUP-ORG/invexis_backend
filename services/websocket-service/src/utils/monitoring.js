// websocket-service/src/utils/monitoring.js
const prometheus = require('prom-client');
const logger = require('./logger');
const os = require('os');

// Initialize prometheus metrics
const metrics = {
    activeConnections: new prometheus.Gauge({
        name: 'ws_active_connections',
        help: 'Number of active WebSocket connections'
    }),
    messageRate: new prometheus.Counter({
        name: 'ws_messages_total',
        help: 'Total number of WebSocket messages',
        labelNames: ['type', 'status']
    }),
    roomSize: new prometheus.Gauge({
        name: 'ws_room_size',
        help: 'Number of clients in rooms',
        labelNames: ['room']
    }),
    eventLatency: new prometheus.Histogram({
        name: 'ws_event_latency_seconds',
        help: 'Latency of event processing',
        buckets: [0.1, 0.5, 1, 2, 5]
    }),
    memoryUsage: new prometheus.Gauge({
        name: 'ws_memory_usage_bytes',
        help: 'Memory usage of the WebSocket service'
    }),
    cpuUsage: new prometheus.Gauge({
        name: 'ws_cpu_usage_percent',
        help: 'CPU usage percentage'
    }),
    redisOperations: new prometheus.Counter({
        name: 'ws_redis_operations_total',
        help: 'Total Redis operations',
        labelNames: ['operation', 'status']
    }),
    rabbitmqMessages: new prometheus.Counter({
        name: 'ws_rabbitmq_messages_total',
        help: 'Total RabbitMQ messages',
        labelNames: ['queue', 'status']
    })
};

// Circuit breaker for protecting the system
class CircuitBreaker {
    constructor(options = {}) {
        this.failureThreshold = options.failureThreshold || 5;
        this.resetTimeout = options.resetTimeout || 60000;
        this.failures = 0;
        this.state = 'CLOSED';
        this.lastFailure = null;
    }

    async execute(operation, fallback) {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailure >= this.resetTimeout) {
                this.state = 'HALF-OPEN';
            } else {
                return await fallback();
            }
        }

        try {
            const result = await operation();
            if (this.state === 'HALF-OPEN') {
                this.reset();
            }
            return result;
        } catch (error) {
            this.recordFailure();
            throw error;
        }
    }

    recordFailure() {
        this.failures++;
        this.lastFailure = Date.now();
        if (this.failures >= this.failureThreshold) {
            this.state = 'OPEN';
            logger.warn(`Circuit breaker opened due to ${this.failures} failures`);
        }
    }

    reset() {
        this.failures = 0;
        this.state = 'CLOSED';
        this.lastFailure = null;
    }
}

// Memory leak detection
class MemoryMonitor {
    constructor(options = {}) {
        this.warningThreshold = options.warningThreshold || 0.8; // 80% of max
        this.criticalThreshold = options.criticalThreshold || 0.9; // 90% of max
        this.checkInterval = options.checkInterval || 30000; // 30 seconds
        this.maxMemory = os.totalmem();
        this.lastGC = Date.now();
    }

    start() {
        this.interval = setInterval(() => this.check(), this.checkInterval);
        this.interval.unref(); // Don't prevent process exit
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
        }
    }

    check() {
        const used = process.memoryUsage();
        const heapUsed = used.heapUsed / this.maxMemory;

        metrics.memoryUsage.set(used.heapUsed);

        if (heapUsed > this.criticalThreshold) {
            logger.error('Critical memory usage detected', { usage: heapUsed });
            this.triggerEmergencyGC();
        } else if (heapUsed > this.warningThreshold) {
            logger.warn('High memory usage detected', { usage: heapUsed });
        }

        // Check for potential memory leaks
        if (this.lastCheck && used.heapUsed > this.lastCheck.heapUsed * 1.1) {
            logger.warn('Possible memory leak detected', {
                previous: this.lastCheck.heapUsed,
                current: used.heapUsed
            });
        }

        this.lastCheck = used;
    }

    async triggerEmergencyGC() {
        if (global.gc && Date.now() - this.lastGC > 60000) {
            logger.info('Triggering emergency garbage collection');
            global.gc();
            this.lastGC = Date.now();
        }
    }
}

// Load shedding implementation
class LoadShedder {
    constructor(options = {}) {
        this.maxLoad = options.maxLoad || 0.8; // 80% capacity
        this.shedding = false;
        this.checkInterval = options.checkInterval || 5000; // 5 seconds
    }

    start() {
        this.interval = setInterval(() => this.check(), this.checkInterval);
        this.interval.unref();
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
        }
    }

    check() {
        const cpuUsage = os.loadavg()[0] / os.cpus().length;
        metrics.cpuUsage.set(cpuUsage * 100);

        this.shedding = cpuUsage > this.maxLoad;
        if (this.shedding) {
            logger.warn('Load shedding activated', { cpuUsage });
        }
    }

    shouldAcceptConnection() {
        if (this.shedding) {
            return Math.random() > 0.8; // Accept 20% of new connections
        }
        return true;
    }
}

// Performance tracking
class PerformanceTracker {
    constructor() {
        this.metrics = new Map();
    }

    startTimer(operation) {
        return {
            operation,
            start: process.hrtime.bigint()
        };
    }

    endTimer(timer) {
        const end = process.hrtime.bigint();
        const duration = Number(end - timer.start) / 1e9; // Convert to seconds
        metrics.eventLatency.observe(duration);

        if (duration > 1) { // Log slow operations
            logger.warn('Slow operation detected', {
                operation: timer.operation,
                duration
            });
        }
    }

    trackRedisOperation(operation, status) {
        metrics.redisOperations.inc({ operation, status });
    }

    trackRabbitMQMessage(queue, status) {
        metrics.rabbitmqMessages.inc({ queue, status });
    }
}

// Back pressure handling
class BackPressureHandler {
    constructor(options = {}) {
        this.highWaterMark = options.highWaterMark || 1000;
        this.lowWaterMark = options.lowWaterMark || 800;
        this.currentPressure = 0;
        this.paused = false;
    }

    increment() {
        this.currentPressure++;
        this.checkPressure();
    }

    decrement() {
        this.currentPressure--;
        this.checkPressure();
    }

    checkPressure() {
        if (!this.paused && this.currentPressure > this.highWaterMark) {
            this.paused = true;
            logger.warn('Back pressure: pausing message intake', {
                pressure: this.currentPressure
            });
        } else if (this.paused && this.currentPressure < this.lowWaterMark) {
            this.paused = false;
            logger.info('Back pressure: resuming message intake', {
                pressure: this.currentPressure
            });
        }
    }

    shouldProcess() {
        return !this.paused;
    }
}

// Exports
module.exports = {
    metrics,
    CircuitBreaker,
    MemoryMonitor,
    LoadShedder,
    PerformanceTracker,
    BackPressureHandler,
    register: prometheus.register
};