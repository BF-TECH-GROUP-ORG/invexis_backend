const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { cloudinary } = require('./config');

/**
 * Factory function to create Cloudinary upload middleware
 * @param {Object} options - Upload configuration options
 * @param {string} options.folder - Cloudinary folder path (can include variables like {id})
 * @param {Array<string>} options.allowedFormats - Allowed file formats (e.g., ['jpg', 'png', 'pdf'])
 * @param {number} options.maxFileSize - Maximum file size in bytes (default: 10MB)
 * @param {string} options.resourceType - Cloudinary resource type: 'image', 'video', 'raw', 'auto' (default: 'auto')
 * @param {Object} options.transformation - Optional Cloudinary transformations
 * @returns {multer.Multer} Configured multer middleware
 */
const createUploadMiddleware = (options = {}) => {
    const {
        folder = 'uploads',
        allowedFormats = ['jpg', 'jpeg', 'png', 'gif', 'pdf'],
        maxFileSize = 10 * 1024 * 1024, // 10MB default
        resourceType = 'auto',
        transformation = null,
    } = options;

    // Configure Cloudinary storage
    const storage = new CloudinaryStorage({
        cloudinary: cloudinary,
        params: async (req, file) => {
            // Replace variables in folder path (e.g., {id} with actual ID from params)
            let folderPath = folder;
            if (req.params) {
                Object.keys(req.params).forEach(key => {
                    folderPath = folderPath.replace(`{${key}}`, req.params[key]);
                });
            }

            // Determine file format based on mimetype
            let format;
            if (file.mimetype === 'application/pdf') {
                format = 'pdf';
            } else if (file.mimetype.startsWith('image/')) {
                format = file.mimetype.split('/')[1];
            } else if (file.mimetype.startsWith('video/')) {
                format = file.mimetype.split('/')[1];
            } else {
                format = 'auto';
            }

            const params = {
                folder: folderPath,
                format: format,
                resource_type: resourceType,
                public_id: `${Date.now()}-${file.originalname.split('.')[0]}`,
                allowed_formats: allowedFormats,
            };

            // Add transformations if provided
            if (transformation) {
                params.transformation = transformation;
            }

            return params;
        },
    });

    // File filter for validation
    const fileFilter = (req, file, cb) => {
        const ext = file.originalname.split('.').pop().toLowerCase();
        const mimeType = file.mimetype.toLowerCase();

        // Check if format is allowed
        const formatAllowed = allowedFormats.some(format => {
            const formatLower = format.toLowerCase();
            return ext === formatLower || mimeType.includes(formatLower);
        });

        if (formatAllowed) {
            cb(null, true);
        } else {
            cb(
                new Error(
                    `Invalid file type. Only ${allowedFormats.join(', ')} files are allowed.`
                ),
                false
            );
        }
    };

    // Create and return multer instance
    return multer({
        storage: storage,
        fileFilter: fileFilter,
        limits: {
            fileSize: maxFileSize,
        },
    });
};

/**
 * Error handler middleware for multer/cloudinary errors
 */
const handleUploadError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File too large',
                error: err.message,
            });
        }
        return res.status(400).json({
            success: false,
            message: 'Upload error',
            error: err.message,
        });
    } else if (err) {
        return res.status(400).json({
            success: false,
            message: 'File upload failed',
            error: err.message,
        });
    }
    next();
};

module.exports = { createUploadMiddleware, handleUploadError };
