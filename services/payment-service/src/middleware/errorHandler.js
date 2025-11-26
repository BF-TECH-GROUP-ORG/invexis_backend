// src/middleware/errorHandler.js
// Centralized error handling middleware

/**
 * Global error handler
 */
const errorHandler = (err, req, res, next) => {
    console.error('Error:', {
        message: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        body: req.body,
        timestamp: new Date().toISOString()
    });

    // Handle specific error types
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: err.details || err.message
        });
    }

    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized access'
        });
    }

    if (err.name === 'NotFoundError') {
        return res.status(404).json({
            success: false,
            message: err.message || 'Resource not found'
        });
    }

    // Database errors
    if (err.code === '23505') { // Unique violation
        return res.status(409).json({
            success: false,
            message: 'Duplicate entry'
        });
    }

    if (err.code === '23503') { // Foreign key violation
        return res.status(400).json({
            success: false,
            message: 'Invalid reference'
        });
    }

    // Default error response
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.url} not found`
    });
};

module.exports = {
    errorHandler,
    notFoundHandler
};
