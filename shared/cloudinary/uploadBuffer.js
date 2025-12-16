const { cloudinary } = require('./config');
const { Readable } = require('stream');

/**
 * Upload a buffer or stream directly to Cloudinary
 * Useful for uploading files generated in-memory (e.g., PDFs)
 * 
 * @param {Buffer|Stream} bufferOrStream - The file content to upload
 * @param {Object} options - Upload configuration options
 * @param {string} options.folder - Cloudinary folder path
 * @param {string} options.publicId - Public ID for the file (optional, auto-generated if not provided)
 * @param {string} options.resourceType - Resource type: 'image', 'video', 'raw', 'auto' (default: 'raw')
 * @param {string} options.format - File format (e.g., 'pdf', 'png')
 * @param {Object} options.transformation - Optional Cloudinary transformations
 * @returns {Promise<Object>} Upload result with url, secure_url, public_id, etc.
 */
const uploadBuffer = (bufferOrStream, options = {}) => {
    return new Promise((resolve, reject) => {
        const {
            folder = 'uploads',
            publicId = null,
            resourceType = 'raw',
            format = null,
            transformation = null,
        } = options;

        // Build upload options
        const uploadOptions = {
            folder: folder,
            resource_type: resourceType,
        };

        if (publicId) {
            uploadOptions.public_id = publicId;
        }

        if (format) {
            uploadOptions.format = format;
        }

        if (transformation) {
            uploadOptions.transformation = transformation;
        }

        // Convert buffer to stream if needed
        let uploadStream;
        if (Buffer.isBuffer(bufferOrStream)) {
            uploadStream = Readable.from(bufferOrStream);
        } else {
            uploadStream = bufferOrStream;
        }

        // Use Cloudinary's upload_stream for buffer/stream uploads
        const cloudinaryStream = cloudinary.uploader.upload_stream(
            uploadOptions,
            (error, result) => {
                if (error) {
                    return reject(error);
                }
                resolve(result);
            }
        );

        // Pipe the stream to Cloudinary
        uploadStream.pipe(cloudinaryStream);
    });
};

/**
 * Delete a file from Cloudinary
 * @param {string} publicId - The public ID of the file to delete
 * @param {string} resourceType - Resource type: 'image', 'video', 'raw' (default: 'raw')
 * @returns {Promise<Object>} Deletion result
 */
const deleteFile = async (publicId, resourceType = 'raw') => {
    try {
        const result = await cloudinary.uploader.destroy(publicId, {
            resource_type: resourceType,
        });
        return result;
    } catch (error) {
        console.error('❌ Error deleting file from Cloudinary:', error.message);
        throw error;
    }
};

module.exports = { uploadBuffer, deleteFile };
