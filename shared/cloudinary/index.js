const { cloudinary, validateConfig } = require('./config');

// Safe imports with fallbacks
let createUploadMiddleware, handleUploadError, uploadBuffer, deleteFile;
try {
  ({ createUploadMiddleware, handleUploadError } = require('./upload'));
  ({ uploadBuffer, deleteFile } = require('./uploadBuffer'));
} catch (err) {
  // Provide fallback functions when cloudinary is not available
  createUploadMiddleware = () => (req, res, next) => {
    console.warn('⚠️  Upload middleware not available - Cloudinary not installed');
    next();
  };
  handleUploadError = (err, req, res, next) => {
    console.warn('⚠️  Upload error handler not available');
    next(err);
  };
  uploadBuffer = () => Promise.reject(new Error('Cloudinary not available'));
  deleteFile = () => Promise.resolve();
}

const presets = require('./presets');

module.exports = {
    cloudinary: cloudinary || null,
    validateConfig,
    createUploadMiddleware,
    handleUploadError,
    uploadBuffer,
    deleteFile,
    presets,
};
