// Import shared Cloudinary utilities
const { createUploadMiddleware, handleUploadError } = require('/app/shared/cloudinary');

// Create upload middleware for profile pictures
const upload = createUploadMiddleware({
    folder: 'profiles/{userId}',
    allowedFormats: ['jpg', 'jpeg', 'png', 'gif'],
    maxFileSize: 5 * 1024 * 1024, // 5MB
    resourceType: 'image',
    transformation: {
        width: 500,
        height: 500,
        crop: 'fill',
        gravity: 'face', // Smart crop focused on face
        quality: 'auto',
        fetch_format: 'auto',
    },
}).single('profilePicture');

const uploadProfileImage = (req, res, next) => {
    // Replace {userId} with actual user ID from request
    if (req.user && req.user._id) {
        req.params.userId = req.user._id;
    }

    upload(req, res, (err) => {
        // Use shared error handler
        if (err) {
            return handleUploadError(err, req, res, next);
        }

        if (!req.file) {
            return res.status(400).json({ ok: false, message: 'No file uploaded' });
        }

        // Set Cloudinary URL instead of local path
        req.profilePictureUrl = req.file.path; // Cloudinary URL
        req.cloudinaryPublicId = req.file.filename; // Store for potential deletion

        next();
    });
};

module.exports = { uploadProfileImage };