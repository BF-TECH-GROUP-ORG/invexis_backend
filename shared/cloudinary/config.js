// Optional Cloudinary dependency handling
let cloudinary;
try {
  cloudinary = require('cloudinary').v2;
} catch (err) {
  console.warn('⚠️  Cloudinary not installed - image upload features disabled');
  cloudinary = null;
}

// Configure Cloudinary with environment variables
if (cloudinary) {
  cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

// Validate configuration
const validateConfig = () => {
    if (!cloudinary) {
        console.log('ℹ️  Cloudinary not available - skipping validation');
        return false;
    }
    const { cloud_name, api_key, api_secret } = cloudinary.config();

    if (!cloud_name || !api_key || !api_secret) {
        console.error('❌ Cloudinary configuration missing. Please set environment variables:');
        console.error('   - CLOUDINARY_CLOUD_NAME');
        console.error('   - CLOUDINARY_API_KEY');
        console.error('   - CLOUDINARY_API_SECRET');
        return false;
    }

    return true;
};

module.exports = { cloudinary, validateConfig };
