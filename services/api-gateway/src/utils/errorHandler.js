module.exports = (err, req, res, next) => {
    // Log full error internally
    console.error('Gateway Error:', {
        message: err.message,
        stack: err.stack,
        route: req.originalUrl,
        method: req.method,
        user: req.user ? req.user.id : 'unauthenticated',
    });

    // Determine status code
    const statusCode = err.status || err.statusCode || 500;

    // Prepare safe error message for client
    const response = {
        message: statusCode >= 500 ? 'Internal Server Error' : err.message,
    };

    // Include details only in development
    if (process.env.NODE_ENV === 'development') {
        response.details = err.stack;
    }

    res.status(statusCode).json(response);
};
