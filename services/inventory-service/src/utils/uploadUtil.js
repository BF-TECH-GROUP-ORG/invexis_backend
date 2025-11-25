// Import shared Cloudinary utilities
const { createUploadMiddleware, handleUploadError } = require('/app/shared/cloudinary');

// Create upload middleware for product images and videos
const upload = createUploadMiddleware({
  folder: 'products/{productId}',
  allowedFormats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'avi', 'webm'],
  maxFileSize: 50 * 1024 * 1024, // 50MB
  resourceType: 'auto', // Auto-detect image or video
}).fields([
  { name: 'images', maxCount: 10 },
  { name: 'videos', maxCount: 5 }
]);

// Upload handler function
const handleUploads = (req, res, next) => {
  upload(req, res, (err) => {
    // Use shared error handler
    if (err) {
      return handleUploadError(err, req, res, next);
    }

    // Process uploaded files and add to req.body
    if (req.files) {
      if (req.files.images) {
        req.body.images = req.files.images.map(file => ({
          url: file.path, // Cloudinary URL
          cloudinary_id: file.filename, // Cloudinary public ID
          type: 'image',
          format: file.format,
          size: file.size,
          altText: file.originalname
        }));
      }
      if (req.files.videos) {
        req.body.videos = req.files.videos.map(file => ({
          url: file.path, // Cloudinary URL
          cloudinary_id: file.filename, // Cloudinary public ID
          type: 'video',
          format: file.format,
          size: file.size,
          duration: file.duration || null,
          thumbnail: file.eager ? file.eager[0].secure_url : ''
        }));
      }
    }

    next();
  });
};

module.exports = { handleUploads };