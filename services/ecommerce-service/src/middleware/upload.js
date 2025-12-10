/**
 * File Upload Middleware - Cloudinary Integration
 * Handles product images and videos with 100MB size limit
 * Uses Cloudinary for cloud storage instead of local uploads
 */

const { createUploadMiddleware, handleUploadError, cloudinary } = require('/app/shared/cloudinary');
const streamifier = require('streamifier');
const multer = require('multer');
const logger = require('../utils/logger');

// ===== FILE SIZE LIMITS =====
const FILE_LIMITS = {
    // Images: up to 100MB per file
    image: 100 * 1024 * 1024, // 100MB

    // Videos: up to 100MB per file
    video: 100 * 1024 * 1024, // 100MB

    // Total request size: 500MB for multiple files
    totalRequest: 500 * 1024 * 1024 // 500MB
};

// ===== ALLOWED MIME TYPES =====
const ALLOWED_TYPES = {
    images: [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'image/svg+xml'
    ],
    videos: [
        'video/mp4',
        'video/webm',
        'video/quicktime', // .mov
        'video/x-msvideo', // .avi
        'video/x-ms-wmv', // .wmv
        'video/mpeg' // .mpeg
    ]
};

const ALL_ALLOWED_TYPES = [...ALLOWED_TYPES.images, ...ALLOWED_TYPES.videos];

// ===== FILE EXTENSIONS =====
const ALLOWED_EXTENSIONS = {
    images: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'],
    videos: ['.mp4', '.webm', '.mov', '.avi', '.wmv', '.mpeg', '.mkv']
};

const ALL_ALLOWED_EXT = [...ALLOWED_EXTENSIONS.images, ...ALLOWED_EXTENSIONS.videos];

/**
 * Validate file type and size
 * @param {Object} file - File object from req.files
 * @param {String} fileType - 'image' or 'video'
 * @returns {Object} Validation result with success and error
 */
function validateFile(file, fileType = 'image') {
    const path = require('path');
    const ext = path.extname(file.originalname || file.name).toLowerCase();
    const mimeType = file.mimetype;

    // Check extension
    if (fileType === 'image' && !ALLOWED_EXTENSIONS.images.includes(ext)) {
        return {
            success: false,
            error: `Invalid image extension: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.images.join(', ')}`
        };
    }

    if (fileType === 'video' && !ALLOWED_EXTENSIONS.videos.includes(ext)) {
        return {
            success: false,
            error: `Invalid video extension: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.videos.join(', ')}`
        };
    }

    // Check MIME type
    if (fileType === 'image' && !ALLOWED_TYPES.images.includes(mimeType)) {
        return {
            success: false,
            error: `Invalid image MIME type: ${mimeType}`
        };
    }

    if (fileType === 'video' && !ALLOWED_TYPES.videos.includes(mimeType)) {
        return {
            success: false,
            error: `Invalid video MIME type: ${mimeType}`
        };
    }

    // Check file size
    const maxSize = FILE_LIMITS[fileType] || FILE_LIMITS.image;
    if (file.size > maxSize) {
        const maxMB = Math.round(maxSize / (1024 * 1024));
        return {
            success: false,
            error: `File too large: ${file.originalname || file.name}. Max size for ${fileType}s: ${maxMB}MB`
        };
    }

    return { success: true };
}

/**
 * Upload a buffer to Cloudinary
 * @param {Buffer} buffer - File buffer
 * @param {string} folder - Cloudinary folder path
 * @param {string} publicId - Cloudinary public ID
 * @param {string} resourceType - 'image' or 'video'
 * @returns {Promise<object>} Cloudinary upload result
 */
const uploadBuffer = (buffer, folder, publicId, resourceType = 'image') => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: folder,
                public_id: publicId,
                resource_type: resourceType
            },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );
        streamifier.createReadStream(buffer).pipe(uploadStream);
    });
};

/**
 * Create Multer upload middleware with memory storage for Cloudinary
 * Handles both images and videos with proper size limits
 * @returns {Express.Middleware} Multer middleware
 */
function createUploadHandler() {
    // Configure storage to memory (for streaming to Cloudinary)
    const storage = multer.memoryStorage();

    // File filter
    const fileFilter = (req, file, cb) => {
        if (ALL_ALLOWED_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`File type not allowed: ${file.mimetype}`), false);
        }
    };

    const upload = multer({
        storage: storage,
        fileFilter: fileFilter,
        limits: {
            fileSize: Math.max(FILE_LIMITS.image, FILE_LIMITS.video),
            files: 15 // Max 15 files total (10 images + 5 videos)
        }
    });

    return upload;
}

/**
 * Upload product images to Cloudinary
 * Processes array of images and returns Cloudinary URLs
 * @param {Array} imageFiles - Array of file objects from multer
 * @param {String} productId - Product ID for folder organization
 * @returns {Promise<Array>} Array of uploaded image objects with Cloudinary URLs
 */
async function uploadProductImages(imageFiles, productId) {
    if (!imageFiles || imageFiles.length === 0) {
        return [];
    }

    // Ensure it's an array
    const files = Array.isArray(imageFiles) ? imageFiles : [imageFiles];

    const uploadedImages = [];
    const folder = `ecommerce/products/${productId}/images`;

    for (const file of files) {
        try {
            // Validate file
            const validation = validateFile(file, 'image');
            if (!validation.success) {
                logger.warn('❌ Image validation failed', { error: validation.error, fileName: file.originalname });
                continue;
            }

            // Generate unique public ID
            const timestamp = Date.now();
            const random = Math.random().toString(36).substring(7);
            const publicId = `image-${timestamp}-${random}`;

            // Upload to Cloudinary
            const result = await uploadBuffer(
                file.buffer,
                folder,
                publicId,
                'image'
            );

            uploadedImages.push({
                url: result.secure_url || result.url,
                cloudinary_id: result.public_id,
                name: file.originalname,
                type: 'image',
                format: result.format,
                size: file.size,
                width: result.width,
                height: result.height,
                uploadedAt: new Date()
            });

            logger.info(`✅ Image uploaded to Cloudinary`, {
                productId,
                publicId: result.public_id,
                url: result.secure_url || result.url,
                size: `${(file.size / (1024 * 1024)).toFixed(2)}MB`
            });
        } catch (error) {
            logger.error('❌ Error uploading image to Cloudinary', {
                productId,
                fileName: file.originalname,
                error: error.message
            });
        }
    }

    return uploadedImages;
}

/**
 * Upload product videos to Cloudinary
 * Processes array of videos and returns Cloudinary URLs
 * @param {Array} videoFiles - Array of file objects from multer
 * @param {String} productId - Product ID for folder organization
 * @returns {Promise<Array>} Array of uploaded video objects with Cloudinary URLs
 */
async function uploadProductVideos(videoFiles, productId) {
    if (!videoFiles || videoFiles.length === 0) {
        return [];
    }

    // Ensure it's an array
    const files = Array.isArray(videoFiles) ? videoFiles : [videoFiles];

    const uploadedVideos = [];
    const folder = `products/${productId}/videos`;

    for (const file of files) {
        try {
            // Validate file
            const validation = validateFile(file, 'video');
            if (!validation.success) {
                logger.warn('❌ Video validation failed', { error: validation.error, fileName: file.originalname });
                continue;
            }

            // Generate unique public ID
            const timestamp = Date.now();
            const random = Math.random().toString(36).substring(7);
            const publicId = `video-${timestamp}-${random}`;

            // Upload to Cloudinary
            const result = await uploadBuffer(
                file.buffer,
                folder,
                publicId,
                'video'
            );

            uploadedVideos.push({
                url: result.secure_url || result.url,
                cloudinary_id: result.public_id,
                name: file.originalname,
                type: 'video',
                format: result.format,
                size: file.size,
                duration: result.duration || null,
                width: result.width,
                height: result.height,
                uploadedAt: new Date()
            });

            logger.info(`✅ Video uploaded to Cloudinary`, {
                productId,
                publicId: result.public_id,
                url: result.secure_url || result.url,
                size: `${(file.size / (1024 * 1024)).toFixed(2)}MB`,
                duration: result.duration ? `${result.duration}s` : 'N/A'
            });
        } catch (error) {
            logger.error('❌ Error uploading video to Cloudinary', {
                productId,
                fileName: file.originalname,
                error: error.message
            });
        }
    }

    return uploadedVideos;
}

/**
 * Upload both product images and videos to Cloudinary
 * Combines image and video uploads in single operation
 * @param {Object} files - File object from req.files containing images and videos arrays
 * @param {String} productId - Product ID for folder organization
 * @returns {Promise<Object>} Upload results { images: [], videos: [], errors: [] }
 */
async function uploadProductMedia(files, productId) {
    const result = {
        images: [],
        videos: [],
        errors: []
    };

    try {
        if (files && files.images) {
            result.images = await uploadProductImages(files.images, productId);
        }

        if (files && files.videos) {
            result.videos = await uploadProductVideos(files.videos, productId);
        }

        const totalSize = result.images.concat(result.videos).reduce((sum, f) => sum + f.size, 0);
        logger.info(`✅ Media upload to Cloudinary completed`, {
            productId,
            imagesCount: result.images.length,
            videosCount: result.videos.length,
            totalSize: `${(totalSize / (1024 * 1024)).toFixed(2)}MB`
        });
    } catch (error) {
        logger.error('❌ Error during media upload to Cloudinary', {
            productId,
            error: error.message
        });
        result.errors.push(error.message);
    }

    return result;
}

/**
 * Express middleware handler for uploading product images
 * Endpoint: POST /ecommerce/upload/images
 * @param {Object} req - Express request with files.images
 * @param {Object} res - Express response
 */
async function handleImageUpload(req, res) {
    try {
        if (!req.files || !req.files.images) {
            return res.status(400).json({
                success: false,
                message: 'No image files provided'
            });
        }

        const { productId } = req.body;
        if (!productId) {
            return res.status(400).json({
                success: false,
                message: 'productId is required in request body'
            });
        }

        const uploadedImages = await uploadProductImages(req.files.images, productId);

        if (uploadedImages.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No images were uploaded successfully'
            });
        }

        return res.json({
            success: true,
            message: `Successfully uploaded ${uploadedImages.length} image(s)`,
            data: uploadedImages
        });
    } catch (error) {
        logger.error('Error in handleImageUpload:', error);
        return handleUploadError(res, error);
    }
}

/**
 * Express middleware handler for uploading product videos
 * Endpoint: POST /ecommerce/upload/videos
 * @param {Object} req - Express request with files.videos
 * @param {Object} res - Express response
 */
async function handleVideoUpload(req, res) {
    try {
        if (!req.files || !req.files.videos) {
            return res.status(400).json({
                success: false,
                message: 'No video files provided'
            });
        }

        const { productId } = req.body;
        if (!productId) {
            return res.status(400).json({
                success: false,
                message: 'productId is required in request body'
            });
        }

        const uploadedVideos = await uploadProductVideos(req.files.videos, productId);

        if (uploadedVideos.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No videos were uploaded successfully'
            });
        }

        return res.json({
            success: true,
            message: `Successfully uploaded ${uploadedVideos.length} video(s)`,
            data: uploadedVideos
        });
    } catch (error) {
        logger.error('Error in handleVideoUpload:', error);
        return handleUploadError(res, error);
    }
}

/**
 * Express middleware handler for uploading both images and videos
 * Endpoint: POST /ecommerce/upload/media
 * @param {Object} req - Express request with files.images and/or files.videos
 * @param {Object} res - Express response
 */
async function handleMediaUpload(req, res) {
    try {
        if (!req.files || (!req.files.images && !req.files.videos)) {
            return res.status(400).json({
                success: false,
                message: 'No files provided. Include images and/or videos'
            });
        }

        const { productId } = req.body;
        if (!productId) {
            return res.status(400).json({
                success: false,
                message: 'productId is required in request body'
            });
        }

        const uploadResults = await uploadProductMedia(req.files, productId);

        if (uploadResults.images.length === 0 && uploadResults.videos.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No files were uploaded successfully',
                errors: uploadResults.errors
            });
        }

        const totalCount = uploadResults.images.length + uploadResults.videos.length;
        return res.json({
            success: true,
            message: `Successfully uploaded ${totalCount} file(s)`,
            data: uploadResults
        });
    } catch (error) {
        logger.error('Error in handleMediaUpload:', error);
        return handleUploadError(res, error);
    }
}

module.exports = {
    createUploadHandler,
    uploadProductImages,
    uploadProductVideos,
    uploadProductMedia,
    handleImageUpload,
    handleVideoUpload,
    handleMediaUpload,
    FILE_LIMITS,
    ALLOWED_TYPES,
    ALLOWED_EXTENSIONS,
    validateFile,
    uploadBuffer
};
