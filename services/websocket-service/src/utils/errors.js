// websocket-service/src/utils/errors.js (unchanged)
class BaseError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

class UnauthorizedError extends BaseError {
    constructor(message = 'Unauthorized') {
        super(message, 401);
    }
}

class ForbiddenError extends BaseError {
    constructor(message = 'Forbidden') {
        super(message, 403);
    }
}

module.exports = { BaseError, UnauthorizedError, ForbiddenError };