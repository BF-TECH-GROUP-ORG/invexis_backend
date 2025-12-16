// src/utils/responses.js
// Utility for consistent API responses (success/error).

const successResponse = (res, data, message = 'Success') => {
    return res.status(200).json({
        success: true,
        data,
        message
    });
};

const errorResponse = (res, message, status = 500) => {
    return res.status(status).json({
        success: false,
        message
    });
};

module.exports = { successResponse, errorResponse };