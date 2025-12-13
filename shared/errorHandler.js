// shared/errorHandler.js
// Comprehensive error handling middleware and utilities

const { getLogger } = require('./logger');

class AppError extends Error {
  constructor(message, statusCode, code = null, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.code = code;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, errors = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.errors = errors;
    this.name = 'ValidationError';
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
    this.name = 'AuthorizationError';
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT_ERROR');
    this.name = 'ConflictError';
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_ERROR');
    this.name = 'RateLimitError';
  }
}

class DatabaseError extends AppError {
  constructor(message, originalError = null) {
    super(message, 500, 'DATABASE_ERROR');
    this.originalError = originalError;
    this.name = 'DatabaseError';
  }
}

class ExternalServiceError extends AppError {
  constructor(message, service, originalError = null) {
    super(message, 502, 'EXTERNAL_SERVICE_ERROR');
    this.service = service;
    this.originalError = originalError;
    this.name = 'ExternalServiceError';
  }
}

class ErrorHandler {
  constructor(serviceName) {
    this.serviceName = serviceName;
    this.logger = getLogger(serviceName);
  }

  // Convert known errors to AppError
  handleKnownErrors(error) {
    // MongoDB errors
    if (error.name === 'MongoError' || error.name === 'MongoServerError') {
      if (error.code === 11000) {
        return new ConflictError('Duplicate entry found');
      }
      return new DatabaseError('Database operation failed', error);
    }

    // Mongoose validation errors
    if (error.name === 'ValidationError' && error.errors) {
      const errors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message,
        value: err.value
      }));
      return new ValidationError('Validation failed', errors);
    }

    // JWT errors
    if (error.name === 'JsonWebTokenError') {
      return new AuthenticationError('Invalid token');
    }

    if (error.name === 'TokenExpiredError') {
      return new AuthenticationError('Token expired');
    }

    // PostgreSQL/Knex errors
    if (error.code && error.code.startsWith('23')) {
      if (error.code === '23505') {
        return new ConflictError('Duplicate entry found');
      }
      if (error.code === '23503') {
        return new ValidationError('Foreign key constraint violation');
      }
      return new DatabaseError('Database constraint violation', error);
    }

    // Axios errors
    if (error.isAxiosError) {
      return new ExternalServiceError(
        'External service error',
        error.config?.baseURL || 'unknown',
        error
      );
    }

    // Multer errors
    if (error.code === 'LIMIT_FILE_SIZE') {
      return new ValidationError('File too large');
    }

    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return new ValidationError('Unexpected file field');
    }

    // Redis errors
    if (error.code === 'ECONNREFUSED' && error.address) {
      return new ExternalServiceError('Redis connection failed', 'redis', error);
    }

    // Default to original error if not recognized
    return error;
  }

  // Development error response
  sendErrorDev(error, req, res) {
    const errorResponse = {
      status: error.status,
      error: {
        message: error.message,
        name: error.name,
        code: error.code,
        stack: error.stack,
        ...(error.errors && { errors: error.errors }),
        ...(error.service && { service: error.service })
      },
      request: {
        method: req.method,
        url: req.originalUrl || req.url,
        headers: req.headers,
        body: req.body,
        params: req.params,
        query: req.query
      },
      timestamp: new Date().toISOString()
    };

    res.status(error.statusCode || 500).json(errorResponse);
  }

  // Production error response
  sendErrorProd(error, req, res) {
    // Operational, trusted error: send message to client
    if (error.isOperational) {
      const errorResponse = {
        status: error.status,
        message: error.message,
        code: error.code,
        ...(error.errors && { errors: error.errors }),
        timestamp: new Date().toISOString(),
        requestId: req.id || 'unknown'
      };

      res.status(error.statusCode).json(errorResponse);
    } else {
      // Programming or other unknown error: don't leak error details
      this.logger.logError(error, {
        method: req.method,
        url: req.originalUrl || req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });

      res.status(500).json({
        status: 'error',
        message: 'Something went wrong!',
        code: 'INTERNAL_SERVER_ERROR',
        timestamp: new Date().toISOString(),
        requestId: req.id || 'unknown'
      });
    }
  }

  // Main error handling middleware
  globalErrorHandler() {
    return (error, req, res, next) => {
      // Set default error properties
      error.statusCode = error.statusCode || 500;
      error.status = error.status || 'error';

      // Convert known errors
      error = this.handleKnownErrors(error);

      // Log the error
      this.logger.logError(error, {
        method: req.method,
        url: req.originalUrl || req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        userId: req.user?.id,
        body: req.body,
        params: req.params,
        query: req.query
      });

      // Send error response
      if (process.env.NODE_ENV === 'development') {
        this.sendErrorDev(error, req, res);
      } else {
        this.sendErrorProd(error, req, res);
      }
    };
  }

  // Async error wrapper
  catchAsync(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  // 404 handler
  notFoundHandler() {
    return (req, res, next) => {
      const error = new NotFoundError(`Can't find ${req.originalUrl} on this server!`);
      next(error);
    };
  }

  // Unhandled rejection handler
  handleUnhandledRejection() {
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled Promise Rejection', {
        reason: reason.message || reason,
        stack: reason.stack,
        promise
      });

      // Close server gracefully
      process.exit(1);
    });
  }

  // Uncaught exception handler
  handleUncaughtException() {
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught Exception', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });

      // Close server gracefully
      process.exit(1);
    });
  }

  // Setup all error handlers
  setupErrorHandlers(app) {
    // Handle uncaught exceptions and unhandled rejections
    this.handleUncaughtException();
    this.handleUnhandledRejection();

    // 404 handler (must be last route)
    app.all('*', this.notFoundHandler());

    // Global error handler (must be last middleware)
    app.use(this.globalErrorHandler());
  }
}

// Validation helper functions
function validateRequired(fields, data) {
  const errors = [];
  
  for (const field of fields) {
    if (!data[field] || (typeof data[field] === 'string' && !data[field].trim())) {
      errors.push({
        field,
        message: `${field} is required`,
        value: data[field]
      });
    }
  }

  if (errors.length > 0) {
    throw new ValidationError('Validation failed', errors);
  }
}

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError('Invalid email format');
  }
}

function validatePassword(password, minLength = 8) {
  if (password.length < minLength) {
    throw new ValidationError(`Password must be at least ${minLength} characters long`);
  }

  // Check for at least one uppercase, lowercase, number, and special character
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?\":{}|<>]/.test(password);

  if (!hasUpper || !hasLower || !hasNumber || !hasSpecial) {
    throw new ValidationError(
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    );
  }
}

function validateUUID(id) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    throw new ValidationError('Invalid ID format');
  }
}

module.exports = {
  ErrorHandler,
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  DatabaseError,
  ExternalServiceError,
  validateRequired,
  validateEmail,
  validatePassword,
  validateUUID
};