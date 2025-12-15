// shared/security.js
// Production-ready security middleware and utilities for microservices
// CORS is handled at API Gateway level

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { getLogger } = require('./logger');
const { AuthenticationError, AuthorizationError, RateLimitError } = require('./errorHandler');

// Optional dependencies with fallbacks
let mongoSanitize, xss;
try {
  mongoSanitize = require('express-mongo-sanitize');
} catch (e) {
  mongoSanitize = null;
}

try {
  xss = require('xss-clean');
} catch (e) {
  xss = null;
}

class SecurityManager {
  constructor(serviceName, options = {}) {
    this.serviceName = serviceName;
    this.logger = getLogger(serviceName);
    this.options = {
      // CORS handled by API Gateway - services trust gateway
      rateLimitWindow: options.rateLimitWindow || parseInt(process.env.RATE_LIMIT_WINDOW) || 15,
      rateLimitMax: options.rateLimitMax || parseInt(process.env.RATE_LIMIT_MAX) || 100, // Lower for services
      jwtSecret: options.jwtSecret || process.env.JWT_SECRET,
      apiSecretKey: options.apiSecretKey || process.env.API_SECRET,
      trustGateway: options.trustGateway !== false, // Default to trusting gateway
      ...options
    };
  }

  // Helmet security headers
  getHelmetConfig() {
    return helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      },
      crossOriginEmbedderPolicy: false,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    });
  }

  // Gateway trust validation (replaces CORS for microservices)
  getGatewayTrustMiddleware() {
    return (req, res, next) => {
      // Allow in development or if trust is disabled
      if (process.env.NODE_ENV !== 'production' || !this.options.trustGateway) {
        return next();
      }

      const gatewayHeader = req.headers['x-gateway-request'];
      const gatewayService = req.headers['x-gateway-service'];
      
      if (!gatewayHeader) {
        this.logger.logSecurity('DIRECT_ACCESS_BLOCKED', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path,
          method: req.method
        });
        
        return res.status(403).json({ 
          error: 'Direct access not allowed. Requests must come through API Gateway.',
          code: 'GATEWAY_REQUIRED'
        });
      }

      // Extract user information from gateway headers
      const userId = req.headers['x-user-id'];
      const userEmail = req.headers['x-user-email'];
      const userRole = req.headers['x-user-role'];
      const companyId = req.headers['x-company-id'];

      // Add user context to request for service use
      if (userId) {
        req.user = {
          id: userId,
          email: userEmail,
          role: userRole,
          companyId: companyId
        };
      }

      next();
    };
  }

  // Rate limiting
  getRateLimitConfig(options = {}) {
    return rateLimit({
      windowMs: (options.windowMs || this.options.rateLimitWindow) * 60 * 1000,
      max: options.max || this.options.rateLimitMax,
      message: {
        status: 'error',
        message: 'Too many requests, please try again later',
        code: 'RATE_LIMIT_EXCEEDED'
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        this.logger.logSecurity('RATE_LIMIT_EXCEEDED', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          url: req.originalUrl,
          method: req.method
        });
        
        throw new RateLimitError('Too many requests, please try again later');
      },
      skip: (req) => {
        // Skip rate limiting for health checks
        return req.path.startsWith('/health') || req.path === '/metrics';
      }
    });
  }

  // API key authentication
  apiKeyAuth(options = {}) {
    const requiredApiKey = options.apiKey || this.options.apiSecretKey;
    
    return (req, res, next) => {
      const apiKey = req.header('X-API-Key') || req.query.apiKey;

      if (!apiKey) {
        this.logger.logSecurity('MISSING_API_KEY', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          url: req.originalUrl
        });
        throw new AuthenticationError('API key required');
      }

      if (apiKey !== requiredApiKey) {
        this.logger.logSecurity('INVALID_API_KEY', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          url: req.originalUrl,
          providedKey: apiKey.substring(0, 8) + '***'
        });
        throw new AuthenticationError('Invalid API key');
      }

      next();
    };
  }

  // JWT authentication
  jwtAuth(options = {}) {
    const secret = options.secret || this.options.jwtSecret;
    
    return (req, res, next) => {
      try {
        const authHeader = req.header('Authorization');
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          throw new AuthenticationError('Access token required');
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, secret);
        
        req.user = decoded;
        req.userId = decoded.id || decoded.userId;
        
        this.logger.debug('JWT Authentication Successful', {
          userId: req.userId,
          tokenExp: new Date(decoded.exp * 1000).toISOString()
        });

        next();
      } catch (error) {
        if (error.name === 'JsonWebTokenError') {
          this.logger.logSecurity('INVALID_JWT_TOKEN', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            error: error.message
          });
          throw new AuthenticationError('Invalid token');
        }
        
        if (error.name === 'TokenExpiredError') {
          this.logger.logSecurity('EXPIRED_JWT_TOKEN', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            expiredAt: error.expiredAt
          });
          throw new AuthenticationError('Token expired');
        }

        throw error;
      }
    };
  }

  // Role-based authorization
  requireRole(roles) {
    return (req, res, next) => {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const userRoles = Array.isArray(req.user.roles) ? req.user.roles : [req.user.role];
      const requiredRoles = Array.isArray(roles) ? roles : [roles];
      
      const hasRole = requiredRoles.some(role => userRoles.includes(role));

      if (!hasRole) {
        this.logger.logSecurity('INSUFFICIENT_PERMISSIONS', {
          userId: req.user.id,
          userRoles,
          requiredRoles,
          url: req.originalUrl,
          method: req.method
        });
        throw new AuthorizationError(`Insufficient permissions. Required: ${requiredRoles.join(' or ')}`);
      }

      next();
    };
  }

  // Permission-based authorization
  requirePermission(permissions) {
    return (req, res, next) => {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const userPermissions = req.user.permissions || [];
      const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];
      
      const hasPermission = requiredPermissions.some(permission => 
        userPermissions.includes(permission)
      );

      if (!hasPermission) {
        this.logger.logSecurity('INSUFFICIENT_PERMISSIONS', {
          userId: req.user.id,
          userPermissions,
          requiredPermissions,
          url: req.originalUrl,
          method: req.method
        });
        throw new AuthorizationError(`Insufficient permissions. Required: ${requiredPermissions.join(' or ')}`);
      }

      next();
    };
  }

  // Request ID middleware
  requestId() {
    return (req, res, next) => {
      const { v4: uuidv4 } = require('uuid');
      req.id = req.get('X-Request-ID') || uuidv4();
      res.set('X-Request-ID', req.id);
      next();
    };
  }

  // Input sanitization
  sanitizeInput() {
    const middlewares = [];
    
    // Remove NoSQL injection attempts (if available)
    if (mongoSanitize) {
      middlewares.push((req, res, next) => {
        try {
          mongoSanitize()(req, res, next);
        } catch (err) {
          if (err instanceof TypeError && err.message.includes('Cannot set property query')) {
            // Ignore Express 5 compatibility issue with express-mongo-sanitize
            return next();
          }
          next(err);
        }
      });
    } else {
      this.logger.warn('express-mongo-sanitize not available, skipping NoSQL injection protection');
    }
    
    // Clean user input from malicious HTML (if available)
    if (xss) {
      middlewares.push((req, res, next) => {
        try {
          xss()(req, res, next);
        } catch (err) {
          if (err instanceof TypeError && err.message.includes('Cannot set property query')) {
            // Ignore Express 5 compatibility issue with xss-clean
            return next();
          }
          next(err);
        }
      });
    } else {
      this.logger.warn('xss-clean not available, skipping XSS protection');
    }
    
    // Custom sanitization (always available)
    middlewares.push((req, res, next) => {
        // Trim whitespace from string inputs
        if (req.body && typeof req.body === 'object') {
          for (const [key, value] of Object.entries(req.body)) {
            if (typeof value === 'string') {
              req.body[key] = value.trim();
            }
          }
        }
        
        // Limit request size
        if (req.get('Content-Length') && parseInt(req.get('Content-Length')) > 10 * 1024 * 1024) {
          this.logger.logSecurity('REQUEST_TOO_LARGE', {
            contentLength: req.get('Content-Length'),
            ip: req.ip,
            url: req.originalUrl
          });
          return res.status(413).json({
            status: 'error',
            message: 'Request entity too large',
            code: 'PAYLOAD_TOO_LARGE'
          });
        }

        next();
      })
    
    return middlewares;
  }

  // Security headers middleware
  securityHeaders() {
    return (req, res, next) => {
      // Prevent clickjacking
      res.set('X-Frame-Options', 'DENY');
      
      // Prevent MIME sniffing
      res.set('X-Content-Type-Options', 'nosniff');
      
      // Enable XSS protection
      res.set('X-XSS-Protection', '1; mode=block');
      
      // Prevent referrer leakage
      res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      
      // Prevent Adobe Flash and PDF executing
      res.set('X-Permitted-Cross-Domain-Policies', 'none');
      
      // Remove powered by header
      res.removeHeader('X-Powered-By');

      next();
    };
  }

  // Audit logging middleware
  auditLogger() {
    return (req, res, next) => {
      // Log sensitive operations
      const sensitiveEndpoints = ['/auth', '/admin', '/delete', '/update'];
      const isSensitive = sensitiveEndpoints.some(endpoint => 
        req.originalUrl.includes(endpoint)
      );

      if (isSensitive || req.method !== 'GET') {
        this.logger.info('Audit Log', {
          userId: req.user?.id,
          method: req.method,
          url: req.originalUrl,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          body: this.sanitizeForLogging(req.body),
          params: req.params,
          query: req.query,
          timestamp: new Date().toISOString()
        });
      }

      next();
    };
  }

  // Sanitize data for logging (remove sensitive fields)
  sanitizeForLogging(data) {
    if (!data || typeof data !== 'object') return data;

    const sensitiveFields = ['password', 'token', 'secret', 'key', 'pin', 'otp'];
    const sanitized = { ...data };

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '***';
      }
    }

    return sanitized;
  }

  // Setup all security middleware for microservices
  setupSecurity(app, options = {}) {
    // Basic security headers
    app.use(this.getHelmetConfig());
    app.use(this.securityHeaders());
    
    // Request ID
    app.use(this.requestId());
    
    // Gateway trust validation (replaces CORS for services)
    if (options.enableGatewayTrust !== false) {
      app.use(this.getGatewayTrustMiddleware());
    }
    
    // Rate limiting
    if (options.enableRateLimit !== false) {
      app.use(this.getRateLimitConfig(options.rateLimit));
    }
    
    // Input sanitization
    app.use(this.sanitizeInput());
    
    // Audit logging
    if (options.enableAuditLog !== false) {
      app.use(this.auditLogger());
    }
  }
}

module.exports = {
  SecurityManager
};