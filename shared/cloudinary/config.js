const cloudinary = require('cloudinary').v2;

// Configure Cloudinary with environment variables
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Validate configuration
const validateConfig = () => {
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
