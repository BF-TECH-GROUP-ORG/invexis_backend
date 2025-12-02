const { cloudinary, validateConfig } = require('./config');
const { createUploadMiddleware, handleUploadError } = require('./upload');
const { uploadBuffer, deleteFile } = require('./uploadBuffer');
const presets = require('./presets');

module.exports = {
    cloudinary,
    validateConfig,
    createUploadMiddleware,
    handleUploadError,
    uploadBuffer,
    deleteFile,
    presets,
};
