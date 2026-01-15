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

const paginatedResponse = (res, data, pagination, message = 'Success') => {
    return res.status(200).json({
        success: true,
        data,
        pagination: {
            total: parseInt(pagination.total) || 0,
            limit: parseInt(pagination.limit) || 0,
            offset: parseInt(pagination.offset) || 0,
            count: data.length
        },
        message
    });
};

module.exports = { successResponse, errorResponse, paginatedResponse };