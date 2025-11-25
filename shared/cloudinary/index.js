const { cloudinary, validateConfig } = require('./config');
const { createUploadMiddleware, handleUploadError } = require('./upload');
const presets = require('./presets');

module.exports = {
    cloudinary,
    validateConfig,
    createUploadMiddleware,
    handleUploadError,
    presets,
};
