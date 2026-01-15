// Use shared cloudinary wrapper if available, or fall back to local instance if shared doesn't expose raw config easily.
// Checking shared/cloudinary/index.js it exports 'cloudinary'.
const { cloudinary } = require('/app/shared/cloudinary');
const logger = require('../config/logger');

const uploadStream = (fileStream, folder, publicId, format, resourceType = 'auto') => {
    return new Promise((resolve, reject) => {
        const cloudStream = cloudinary.uploader.upload_stream(
            {
                folder,
                public_id: publicId,
                format: format,
                resource_type: resourceType
            },
            (error, result) => {
                if (error) {
                    logger.error('Cloudinary Upload Failed', error);
                    reject(error);
                } else {
                    resolve(result);
                }
            }
        );

        fileStream.pipe(cloudStream);
    });
};

module.exports = { uploadStream };
