// shared/logger.js
// Production-ready logging module with structured logging

const winston = require('winston');
const path = require('path');

class Logger {
  constructor(serviceName, options = {}) {
    this.serviceName = serviceName;
    this.options = {
      level: options.level || process.env.LOG_LEVEL || 'info',
      format: options.format || process.env.LOG_FORMAT || 'json',
      maxSize: options.maxSize || process.env.LOG_MAX_SIZE || '100MB',
      maxFiles: options.maxFiles || process.env.LOG_MAX_FILES || 10,
      ...options
    };

    this.logger = this.createLogger();
  }

  createLogger() {
    const formats = [];

    // Add timestamp
    formats.push(winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss.SSS'
    }));

    // Add service name and other metadata
    formats.push(winston.format((info) => {
      info.service = this.serviceName;
      info.hostname = require('os').hostname();
      info.pid = process.pid;
      info.environment = process.env.NODE_ENV || 'development';
      return info;
    })());

    // Add error stack traces
    formats.push(winston.format.errors({ stack: true }));

    // Format based on configuration
    if (this.options.format === 'json') {
      formats.push(winston.format.json());
    } else {
      formats.push(winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
          const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta) : '';
          return `${timestamp} [${service}] ${level}: ${message} ${metaStr}`;
        })
      ));
    }

    const transports = [];

    // Console transport
    transports.push(new winston.transports.Console({
      level: this.options.level,
      format: winston.format.combine(...formats)
    }));

    // File transports in production
    if (process.env.NODE_ENV === 'production') {
      // All logs
      transports.push(new winston.transports.File({
        filename: path.join('/app/logs', `${this.serviceName}.log`),
        level: this.options.level,
        format: winston.format.combine(...formats),
        maxsize: this.options.maxSize,
        maxFiles: this.options.maxFiles,
        tailable: true
      }));

      // Error logs only
      transports.push(new winston.transports.File({
        filename: path.join('/app/logs', `${this.serviceName}-error.log`),
        level: 'error',
        format: winston.format.combine(...formats),
        maxsize: this.options.maxSize,
        maxFiles: this.options.maxFiles,
        tailable: true
      }));
    }

    return winston.createLogger({
      level: this.options.level,
      transports,
      exitOnError: false,
      // Prevent crash on uncaught exceptions
      exceptionHandlers: [
        new winston.transports.Console({
          format: winston.format.combine(...formats)
        })
      ],
      rejectionHandlers: [
        new winston.transports.Console({
          format: winston.format.combine(...formats)
        })
      ]
    });
  }

  // Standard logging methods
  info(message, meta = {}) {
    this.logger.info(message, meta);
  }

  error(message, meta = {}) {
    this.logger.error(message, meta);
  }

  warn(message, meta = {}) {
    this.logger.warn(message, meta);
  }

  debug(message, meta = {}) {
    this.logger.debug(message, meta);
  }

  verbose(message, meta = {}) {
    this.logger.verbose(message, meta);
  }

  // HTTP request logging
  logRequest(req, res, responseTime) {
    const logData = {
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
      contentLength: res.get('Content-Length') || 0
    };

    if (res.statusCode >= 400) {
      this.error('HTTP Request Error', logData);
    } else if (res.statusCode >= 300) {
      this.warn('HTTP Request Redirect', logData);
    } else {
      this.info('HTTP Request', logData);
    }
  }

  // Database operation logging
  logDatabaseQuery(operation, table, duration, query = null) {
    const logData = {
      operation,
      table,
      duration: `${duration}ms`,
      query: process.env.LOG_LEVEL === 'debug' ? query : undefined
    };

    if (duration > 1000) {
      this.warn('Slow Database Query', logData);
    } else {
      this.debug('Database Query', logData);
    }
  }

  // Event logging
  logEvent(eventType, eventData = {}) {
    this.info(`Event: ${eventType}`, {
      eventType,
      eventData,
      timestamp: new Date().toISOString()
    });
  }

  // Error logging with context
  logError(error, context = {}) {
    const errorData = {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      ...context
    };

    this.error('Application Error', errorData);
  }

  // Performance logging
  logPerformance(operation, duration, metadata = {}) {
    const logData = {
      operation,
      duration: `${duration}ms`,
      ...metadata
    };

    if (duration > 5000) {
      this.warn('Slow Operation', logData);
    } else {
      this.debug('Performance', logData);
    }
  }

  // Security logging
  logSecurity(event, details = {}) {
    this.warn(`Security Event: ${event}`, {
      securityEvent: event,
      details,
      timestamp: new Date().toISOString()
    });
  }

  // Business logic logging
  logBusiness(action, details = {}) {
    this.info(`Business Action: ${action}`, {
      businessAction: action,
      details,
      timestamp: new Date().toISOString()
    });
  }

  // Express middleware for request logging
  requestLogger() {
    return (req, res, next) => {
      const start = Date.now();

      // Log request start
      this.debug('Incoming Request', {
        method: req.method,
        url: req.originalUrl || req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip || req.connection.remoteAddress,
        contentType: req.get('Content-Type'),
        contentLength: req.get('Content-Length')
      });

      // Override res.end to log response
      const originalEnd = res.end;
      res.end = function(...args) {
        const responseTime = Date.now() - start;
        this.logRequest(req, res, responseTime);
        return originalEnd.apply(res, args);
      }.bind(this);

      next();
    };
  }

  // Error handling middleware
  errorLogger() {
    return (error, req, res, next) => {
      this.logError(error, {
        method: req.method,
        url: req.originalUrl || req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip || req.connection.remoteAddress,
        body: req.body,
        params: req.params,
        query: req.query
      });

      next(error);
    };
  }

  // Create child logger with additional context
  child(metadata) {
    const childLogger = Object.create(this);
    childLogger.logger = this.logger.child(metadata);
    return childLogger;
  }

  // Stream for Morgan HTTP logger
  getStream() {
    return {
      write: (message) => {
        this.info(message.trim());
      }
    };
  }
}

// Create singleton instances for different services
const loggers = new Map();

function getLogger(serviceName, options = {}) {
  if (!loggers.has(serviceName)) {
    loggers.set(serviceName, new Logger(serviceName, options));
  }
  return loggers.get(serviceName);
}

module.exports = {
  Logger,
  getLogger
};