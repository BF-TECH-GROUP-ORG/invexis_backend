// Safe import with fallback for missing Cloudinary
let cloudinaryModule = null;
let streamifier = null;

try {
  cloudinaryModule = require('/app/shared/cloudinary');
  streamifier = require('streamifier');
  
  // Only show success if cloudinary is actually configured
  if (cloudinaryModule && cloudinaryModule.cloudinary && cloudinaryModule.validateConfig()) {
    console.log('✅ Cloudinary module loaded and configured for auth service');
  } else {
    console.log('ℹ️  Cloudinary module loaded but not configured - using fallback for auth service');
    cloudinaryModule = null;
  }
} catch (err) {
  console.log('ℹ️  Using fallback upload handler for auth service - Cloudinary not available');
}

// Fallback upload middleware when Cloudinary is not available
const createFallbackUpload = () => ({
  single: (fieldName) => (req, res, next) => {
    console.log('📁 Using fallback upload handler for profile images');
    
    // Simulate successful upload with placeholder data
    if (req.file) {
      console.log('⚠️  Profile image uploaded but Cloudinary not configured - using placeholder');
      
      // Create placeholder for profile image
      req.file = {
        ...req.file,
        path: 'https://via.placeholder.com/200x200?text=Profile',
        filename: `placeholder_profile_${Date.now()}`,
        cloudinary_id: `placeholder_profile_${Date.now()}`,
        secure_url: 'https://via.placeholder.com/200x200?text=Profile'
      };
    }
    
    next();
  }
});

// Create upload middleware (with fallback)
const upload = (() => {
  if (cloudinaryModule && cloudinaryModule.cloudinary) {
    return cloudinaryModule.createUploadMiddleware({
      folder: 'profiles',
      allowedFormats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      maxFileSize: 5 * 1024 * 1024, // 5MB
      resourceType: 'image',
    });
  }
  return createFallbackUpload();
})();

// Profile image upload function
const uploadProfileImage = upload.single('profileImage');

/**
 * Upload a buffer to Cloudinary for profile images
 * @param {Buffer} buffer 
 * @param {string} userId 
 * @returns {Promise<object>} Cloudinary upload result
 */
const uploadProfileBuffer = (buffer, userId) => {
  if (!cloudinaryModule || !cloudinaryModule.cloudinary || !streamifier) {
    return Promise.resolve({
      secure_url: 'https://via.placeholder.com/200x200?text=Profile',
      public_id: `placeholder_profile_${userId}_${Date.now()}`,
      format: 'jpg',
      bytes: buffer.length
    });
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinaryModule.cloudinary.uploader.upload_stream(
      {
        folder: 'profiles',
        public_id: `profile_${userId}_${Date.now()}`,
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
  uploadProfileImage,
  uploadProfileBuffer,
  upload
};

// Only export cloudinary if available
if (cloudinaryModule && cloudinaryModule.cloudinary) {
  moduleExports.cloudinary = cloudinaryModule.cloudinary;
}

module.exports = moduleExports;