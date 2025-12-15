// shared/health.js
// Comprehensive health check module for all microservices

const os = require('os');
const Redis = require('ioredis');
const amqp = require('amqplib');

class HealthChecker {
  constructor(serviceName, config = {}) {
    this.serviceName = serviceName;
    this.startTime = Date.now();
    this.config = {
      timeout: config.timeout || 5000,
      mongodb: config.mongodb || false,
      postgresql: config.postgresql || false,
      mysql: config.mysql || false,
      redis: config.redis || false,
      rabbitmq: config.rabbitmq || false,
      customChecks: config.customChecks || []
    };
    
    // Metrics collection
    this.metrics = {
      requests: 0,
      errors: 0,
      lastError: null,
      uptime: 0
    };
  }

  // Basic health check endpoint
  async getHealth(req, res) {
    const health = {
      service: this.serviceName,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      platform: os.platform(),
      hostname: os.hostname(),
      pid: process.pid,
      memory: {
        used: process.memoryUsage().heapUsed,
        total: process.memoryUsage().heapTotal,
        external: process.memoryUsage().external,
        rss: process.memoryUsage().rss
      },
      cpu: {
        usage: process.cpuUsage(),
        loadAverage: os.loadavg()
      }
    };

    try {
      // Run dependency checks
      const dependencies = await this.checkDependencies();
      health.dependencies = dependencies;
      
      // Check if any dependencies are unhealthy
      const unhealthyDeps = dependencies.filter(dep => dep.status !== 'healthy');
      if (unhealthyDeps.length > 0) {
        health.status = 'degraded';
        health.issues = unhealthyDeps.map(dep => `${dep.name}: ${dep.error}`);
      }

      res.status(health.status === 'healthy' ? 200 : 503).json(health);
    } catch (error) {
      health.status = 'unhealthy';
      health.error = error.message;
      res.status(500).json(health);
    }
  }

  // Readiness probe
  async getReadiness(req, res) {
    try {
      const dependencies = await this.checkDependencies();
      const failedDeps = dependencies.filter(dep => dep.status !== 'healthy');
      
      if (failedDeps.length > 0) {
        return res.status(503).json({
          status: 'not ready',
          message: 'Dependencies not available',
          failed: failedDeps
        });
      }

      res.json({
        status: 'ready',
        service: this.serviceName,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(503).json({
        status: 'not ready',
        error: error.message
      });
    }
  }

  // Liveness probe
  getLiveness(req, res) {
    res.json({
      status: 'alive',
      service: this.serviceName,
      uptime: Date.now() - this.startTime,
      timestamp: new Date().toISOString()
    });
  }

  // Metrics endpoint for Prometheus
  getMetrics(req, res) {
    const metrics = [
      `# HELP ${this.serviceName}_uptime_seconds Service uptime in seconds`,
      `# TYPE ${this.serviceName}_uptime_seconds counter`,
      `${this.serviceName}_uptime_seconds ${(Date.now() - this.startTime) / 1000}`,
      '',
      `# HELP ${this.serviceName}_requests_total Total number of requests`,
      `# TYPE ${this.serviceName}_requests_total counter`,
      `${this.serviceName}_requests_total ${this.metrics.requests}`,
      '',
      `# HELP ${this.serviceName}_errors_total Total number of errors`,
      `# TYPE ${this.serviceName}_errors_total counter`,
      `${this.serviceName}_errors_total ${this.metrics.errors}`,
      '',
      `# HELP ${this.serviceName}_memory_usage_bytes Memory usage in bytes`,
      `# TYPE ${this.serviceName}_memory_usage_bytes gauge`,
      `${this.serviceName}_memory_usage_bytes ${process.memoryUsage().heapUsed}`,
      '',
      `# HELP ${this.serviceName}_memory_total_bytes Total memory in bytes`,
      `# TYPE ${this.serviceName}_memory_total_bytes gauge`,
      `${this.serviceName}_memory_total_bytes ${process.memoryUsage().heapTotal}`,
      ''
    ].join('\n');

    res.set('Content-Type', 'text/plain');
    res.send(metrics);
  }

  // Check all configured dependencies
  async checkDependencies() {
    const checks = [];

    if (this.config.redis) {
      checks.push(this.checkRedis());
    }

    if (this.config.rabbitmq) {
      checks.push(this.checkRabbitMQ());
    }

    if (this.config.mongodb) {
      checks.push(this.checkMongoDB());
    }

    if (this.config.postgresql) {
      checks.push(this.checkPostgreSQL());
    }

    if (this.config.mysql) {
      checks.push(this.checkMySQL());
    }

    // Add custom checks
    for (const customCheck of this.config.customChecks) {
      checks.push(customCheck());
    }

    return Promise.all(checks);
  }

  // Redis health check
  async checkRedis() {
    const start = Date.now();
    try {
      const redis = new Redis({
        host: process.env.REDIS_HOST || 'redis',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        connectTimeout: this.config.timeout,
        lazyConnect: true
      });

      await redis.ping();
      await redis.disconnect();

      return {
        name: 'redis',
        status: 'healthy',
        responseTime: Date.now() - start,
        details: 'Successfully connected and pinged Redis'
      };
    } catch (error) {
      return {
        name: 'redis',
        status: 'unhealthy',
        responseTime: Date.now() - start,
        error: error.message
      };
    }
  }

  // RabbitMQ health check
  async checkRabbitMQ() {
    const start = Date.now();
    try {
      const connection = await amqp.connect({
        hostname: process.env.RABBITMQ_HOST || 'rabbitmq',
        port: process.env.RABBITMQ_PORT || 5672,
        username: process.env.RABBITMQ_DEFAULT_USER || 'guest',
        password: process.env.RABBITMQ_DEFAULT_PASS || 'guest',
        vhost: process.env.RABBITMQ_VHOST || '/',
        heartbeat: 0,
        connection_timeout: this.config.timeout
      });

      await connection.close();

      return {
        name: 'rabbitmq',
        status: 'healthy',
        responseTime: Date.now() - start,
        details: 'Successfully connected to RabbitMQ'
      };
    } catch (error) {
      return {
        name: 'rabbitmq',
        status: 'unhealthy',
        responseTime: Date.now() - start,
        error: error.message
      };
    }
  }

  // MongoDB health check
  async checkMongoDB() {
    const start = Date.now();
    try {
      const mongoose = require('mongoose');
      const mongoUri = process.env.MONGODB_URL || process.env.MONGO_URI || 'mongodb://root:invexispass@mongodb:27017';
      
      if (mongoose.connection.readyState !== 1) {
        throw new Error('MongoDB not connected');
      }

      // Simple ping
      await mongoose.connection.db.admin().ping();

      return {
        name: 'mongodb',
        status: 'healthy',
        responseTime: Date.now() - start,
        details: 'Successfully pinged MongoDB'
      };
    } catch (error) {
      return {
        name: 'mongodb',
        status: 'unhealthy',
        responseTime: Date.now() - start,
        error: error.message
      };
    }
  }

  // PostgreSQL health check
  async checkPostgreSQL() {
    const start = Date.now();
    try {
      const { Pool } = require('pg');
      const config = {
        connectionTimeoutMillis: this.config.timeout,
        query_timeout: this.config.timeout,
        statement_timeout: this.config.timeout
      };

      if (process.env.DB_POSTGRES) {
        config.connectionString = process.env.DB_POSTGRES;
      } else if (process.env.DATABASE_URL) {
        config.connectionString = process.env.DATABASE_URL;
      }

      const pool = new Pool(config);

      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      await pool.end();

      return {
        name: 'postgresql',
        status: 'healthy',
        responseTime: Date.now() - start,
        details: 'Successfully connected to PostgreSQL'
      };
    } catch (error) {
      return {
        name: 'postgresql',
        status: 'unhealthy',
        responseTime: Date.now() - start,
        error: error.message
      };
    }
  }

  // MySQL health check
  async checkMySQL() {
    const start = Date.now();
    try {
      const mysql = require('mysql2/promise');
      const connection = await mysql.createConnection({
        host: process.env.MYSQL_HOST || 'sales-mysql',
        port: process.env.MYSQL_PORT || 3306,
        user: process.env.MYSQL_USER || 'invexis',
        password: process.env.MYSQL_PASSWORD || 'invexispass',
        database: process.env.MYSQL_DATABASE,
        timeout: this.config.timeout,
        acquireTimeout: this.config.timeout
      });

      await connection.execute('SELECT 1');
      await connection.end();

      return {
        name: 'mysql',
        status: 'healthy',
        responseTime: Date.now() - start,
        details: 'Successfully connected to MySQL'
      };
    } catch (error) {
      return {
        name: 'mysql',
        status: 'unhealthy',
        responseTime: Date.now() - start,
        error: error.message
      };
    }
  }

  // Middleware to track requests and errors
  trackMetrics() {
    return (req, res, next) => {
      this.metrics.requests++;
      
      const originalSend = res.send;
      res.send = function(data) {
        if (res.statusCode >= 400) {
          this.metrics.errors++;
          this.metrics.lastError = {
            timestamp: new Date().toISOString(),
            status: res.statusCode,
            path: req.path,
            method: req.method
          };
        }
        return originalSend.call(this, data);
      }.bind(this);

      next();
    };
  }

  // Graceful shutdown handler
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      console.log(`\n🔄 Received ${signal}, starting graceful shutdown...`);
      
      try {
        // Close server connections, databases, etc.
        console.log('✅ Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  // Setup health check routes
  setupRoutes(app) {
    app.get('/health', this.getHealth.bind(this));
    app.get('/health/ready', this.getReadiness.bind(this));
    app.get('/health/live', this.getLiveness.bind(this));
    app.get('/metrics', this.getMetrics.bind(this));
    
    // Use metrics tracking middleware
    app.use(this.trackMetrics());
  }
}

module.exports = HealthChecker;