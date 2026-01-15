const multer = require('multer');
const logger = require('../utils/logger');

/**
 * Flexible file upload middleware that handles both:
 * 1. JSON requests with base64-encoded images/videos
 * 2. Multipart/form-data requests with actual file uploads
 */

// Configure multer to store files in memory as buffers
const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB per file
        files: 15 // Max 15 files total (10 images + 5 videos)
    },
    fileFilter: (req, file, cb) => {
        // Accept images and videos
        const allowedMimes = [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/gif',
            'image/webp',
            'video/mp4',
            'video/webm',
            'video/quicktime'
        ];

        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`File type ${file.mimetype} not supported. Allowed: images (jpg, png, gif, webp) and videos (mp4, webm, mov)`));
        }
    }
});

/**
 * Middleware to handle flexible file uploads
 * Accepts both 'images' and 'videos' fields
 */
const flexibleUpload = upload.fields([
    { name: 'images', maxCount: 6 },
    { name: 'videos', maxCount: 2 }
]);

/**
 * Middleware to normalize request body
 * Converts multipart data to the same format as JSON requests
 */
const normalizeProductRequest = (req, res, next) => {
    try {
        // If files were uploaded via multipart
        if (req.files) {
            logger.info(`Processing multipart request with ${Object.keys(req.files).length} file field(s)`);

            // Process images
            if (req.files.images && req.files.images.length > 0) {
                req.body.images = req.files.images.map((file, index) => ({
                    data: file.buffer, // Keep as buffer, will convert to base64 later
                    format: file.mimetype.split('/')[1],
                    isPrimary: index === 0,
                    altText: req.body.name || 'Product image',
                    sortOrder: index,
                    size: file.size,
                    originalName: file.originalname
                }));
                logger.info(`Processed ${req.files.images.length} image files`);
            }

            // Process videos
            if (req.files.videos && req.files.videos.length > 0) {
                req.body.videos = req.files.videos.map((file) => ({
                    data: file.buffer, // Keep as buffer
                    format: file.mimetype.split('/')[1],
                    size: file.size,
                    originalName: file.originalname
                }));
                logger.info(`Processed ${req.files.videos.length} video files`);
            }
        }

        // Parse JSON fields that might have been stringified in multipart
        if (typeof req.body.pricing === 'string') {
            try {
                req.body.pricing = JSON.parse(req.body.pricing);
            } catch (e) {
                logger.warn('Failed to parse pricing JSON:', e.message);
            }
        }

        if (typeof req.body.variations === 'string') {
            try {
                req.body.variations = JSON.parse(req.body.variations);
            } catch (e) {
                logger.warn('Failed to parse variations JSON:', e.message);
            }
        }

        if (typeof req.body.attributes === 'string') {
            try {
                req.body.attributes = JSON.parse(req.body.attributes);
            } catch (e) {
                logger.warn('Failed to parse attributes JSON:', e.message);
            }
        }

        // Handle array fields that might be sent as comma-separated strings
        if (typeof req.body.tags === 'string') {
            req.body.tags = req.body.tags.split(',').map(t => t.trim()).filter(Boolean);
        }

        next();
    } catch (error) {
        logger.error('Error normalizing product request:', error);
        res.status(400).json({
            success: false,
            message: 'Failed to process request',
            error: error.message
        });
    }
};

/**
 * Error handler for multer errors
 */
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File too large. Maximum size is 10MB per file.',
                error: err.message
            });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                message: 'Too many files. Maximum is 10 images and 5 videos.',
                error: err.message
            });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({
                success: false,
                message: 'Unexpected file field. Use "images" or "videos".',
                error: err.message
            });
        }
        return res.status(400).json({
            success: false,
            message: 'File upload error',
            error: err.message
        });
    }

    if (err) {
        return res.status(400).json({
            success: false,
            message: err.message || 'File upload failed'
        });
    }

    next();
};

module.exports = {
    flexibleUpload,
    normalizeProductRequest,
    handleMulterError
};
