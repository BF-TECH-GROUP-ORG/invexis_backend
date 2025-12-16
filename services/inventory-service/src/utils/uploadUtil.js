// Safe import with fallback for missing Cloudinary
let cloudinaryModule = null;
let streamifier = null;

try {
  cloudinaryModule = require('/app/shared/cloudinary');
  streamifier = require('streamifier');
  
  // Only show success if cloudinary is actually configured
  if (cloudinaryModule && cloudinaryModule.cloudinary && cloudinaryModule.validateConfig()) {
    console.log('✅ Cloudinary module loaded and configured');
  } else {
    console.log('ℹ️  Cloudinary module loaded but not configured - using fallback');
    cloudinaryModule = null;
  }
} catch (err) {
  console.log('ℹ️  Using fallback upload handler - Cloudinary not available');
}

// Fallback upload middleware when Cloudinary is not available
const createFallbackUpload = () => ({
  fields: (fieldConfig) => (req, res, next) => {
    console.log('📁 Using fallback upload handler - files will not be stored');
    
    // Ensure req.body exists
    req.body = req.body || {};
    
    // Simulate successful upload with placeholder data
    req.files = {};
    req.body.images = req.body.images || [];
    req.body.videos = req.body.videos || [];
    
    // If there were actual files uploaded, create placeholder entries
    if (req.file || (req.files && Object.keys(req.files).length > 0)) {
      console.log('⚠️  Files uploaded but Cloudinary not configured - using placeholders');
      
      // Create placeholder for images
      if (req.files && req.files.images) {
        req.body.images = req.files.images.map((file, index) => ({
          url: `https://via.placeholder.com/400x300?text=Image+${index + 1}`,
          cloudinary_id: `placeholder_image_${Date.now()}_${index}`,
          type: 'image',
          format: 'jpg',
          size: file.size || 0,
          altText: file.originalname || `Placeholder Image ${index + 1}`
        }));
      }
      
      // Create placeholder for videos  
      if (req.files && req.files.videos) {
        req.body.videos = req.files.videos.map((file, index) => ({
          url: `https://via.placeholder.com/400x300?text=Video+${index + 1}`,
          cloudinary_id: `placeholder_video_${Date.now()}_${index}`,
          type: 'video',
          format: 'mp4',
          size: file.size || 0,
          duration: null,
          thumbnail: 'https://via.placeholder.com/400x300?text=Video+Thumbnail'
        }));
      }
    }
    
    next();
  }
});

// Create upload middleware (with fallback)
const upload = (() => {
  if (cloudinaryModule && cloudinaryModule.cloudinary) {
    return cloudinaryModule.createUploadMiddleware({
      folder: 'products/{productId}',
      allowedFormats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'avi', 'webm'],
      maxFileSize: 500 * 1024 * 1024, // 500MB
      resourceType: 'auto', // Auto-detect image or video
    }).fields([
      { name: 'images', maxCount: 10 },
      { name: 'videos', maxCount: 5 }
    ]);
  }
  return createFallbackUpload().fields([
    { name: 'images', maxCount: 10 },
    { name: 'videos', maxCount: 5 }
  ]);
})();

// Upload handler function
const handleUploads = (req, res, next) => {
  upload(req, res, (err) => {
    // Use shared error handler or fallback
    if (err) {
      if (cloudinaryModule && cloudinaryModule.handleUploadError) {
        return cloudinaryModule.handleUploadError(err, req, res, next);
      }
      console.warn('⚠️ Upload error (fallback):', err.message);
      return res.status(400).json({ error: 'Upload failed', message: err.message });
    }

    // Process uploaded files and add to req.body
    if (req.files) {
      if (req.files.images) {
        req.body.images = req.files.images.map(file => ({
          url: file.path, // Cloudinary URL or placeholder
          cloudinary_id: file.filename || file.cloudinary_id, // Cloudinary public ID or placeholder
          type: 'image',
          format: file.format || 'jpg',
          size: file.size || 0,
          altText: file.originalname || file.altText
        }));
      }
      if (req.files.videos) {
        req.body.videos = req.files.videos.map(file => ({
          url: file.path, // Cloudinary URL or placeholder
          cloudinary_id: file.filename || file.cloudinary_id, // Cloudinary public ID or placeholder
          type: 'video',
          format: file.format || 'mp4',
          size: file.size || 0,
          duration: file.duration || null,
          thumbnail: file.eager ? file.eager[0].secure_url : file.thumbnail || ''
        }));
      }
    }

    next();
  });
};

/**
 * Upload a buffer to Cloudinary
 * @param {Buffer} buffer 
 * @param {string} folder 
 * @param {string} publicId 
 * @returns {Promise<object>} Cloudinary upload result
 */
const uploadBuffer = (buffer, folder, publicId) => {
  if (!cloudinaryModule || !cloudinaryModule.cloudinary || !streamifier) {
    return Promise.reject(new Error('Cloudinary not available'));
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinaryModule.cloudinary.uploader.upload_stream(
      {
        folder: folder,
        public_id: publicId,
        resource_type: 'image'
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

// Export with conditional cloudinary
const moduleExports = { 
  handleUploads, 
  uploadBuffer 
};

// Only export cloudinary if available
if (cloudinaryModule && cloudinaryModule.cloudinary) {
  moduleExports.cloudinary = cloudinaryModule.cloudinary;
}

module.exports = moduleExports;