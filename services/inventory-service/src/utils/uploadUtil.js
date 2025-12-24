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

/**
 * Creates a custom upload middleware that sanitizes filenames at the stream level
 * This intercepts multipart data BEFORE Cloudinary processes it
 */
const createSanitizingUploadMiddleware = () => {
  0 << 0
  // If cloudinary isn't configured, use the fallback placeholder middleware
  if (!cloudinaryModule || !cloudinaryModule.cloudinary) {
    return createFallbackUpload().fields([
      { name: 'images', maxCount: 10 },
      { name: 'videos', maxCount: 5 }
    ]);
  }

  // Use multer disk storage to capture files safely and sanitize filenames before upload
  const multer = require('multer');
  const os = require('os');
  const path = require('path');

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, os.tmpdir());
    },
    filename: (req, file, cb) => {
      const sanitized = sanitizePublicId(file.originalname || file.fieldname || `file`);
      const name = `${Date.now()}-${sanitized}${path.extname(file.originalname || '')}`;
      // keep originalname for later use
      file._originalname = file.originalname;
      file.originalname = sanitized;
      cb(null, name);
    }
  });

  const uploadMw = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });
  return uploadMw.fields([
    { name: 'images', maxCount: 10 },
    { name: 'videos', maxCount: 5 }
  ]);
};

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

const uploadTaskRepo = require('../repositories/uploadTaskRepository');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Durable directory for pending retry uploads (survives container restarts if volume-mounted)
const RETRY_UPLOADS_DIR = path.join(process.cwd(), 'data', 'pending_uploads');

async function ensureRetryDir() {
  try {
    await fs.promises.mkdir(RETRY_UPLOADS_DIR, { recursive: true });
  } catch (e) {
    // best-effort
  }
}

async function moveToRetryStorage(tmpPath, originalName) {
  if (!tmpPath) return null;
  await ensureRetryDir();
  const ext = path.extname(originalName || tmpPath) || path.extname(tmpPath) || '';
  const name = `${Date.now()}-${sanitizePublicId(originalName || path.basename(tmpPath))}${ext}`;
  const dest = path.join(RETRY_UPLOADS_DIR, name);
  try {
    try {
      await fs.promises.rename(tmpPath, dest);
    } catch (renameErr) {
      await fs.promises.copyFile(tmpPath, dest);
      try { await fs.promises.unlink(tmpPath); } catch (_) { }
    }
    return dest;
  } catch (e) {
    console.warn('Failed to move file to retry storage:', e && e.message ? e.message : e);
    return tmpPath; // fallback to original path
  }
}

// Create upload middleware (with fallback)
const upload = createSanitizingUploadMiddleware();

/**
 * Preprocessor middleware - can be used before handleUploads for early flag setting
 */
const sanitizeFilenamesPreprocessor = (req, res, next) => {
  // Mark that filename sanitization should be applied
  req.sanitizeFilenames = true;
  next();
};

// Upload handler function
const handleUploads = (req, res, next) => {
  upload(req, res, function (err) {
    // If upload fails with invalid public_id error, try again with sanitized filenames
    if (err && err.message && err.message.includes('public_id')) {
      console.warn('⚠️ Upload failed with invalid public_id, retrying with sanitized filenames...');
      console.warn('Error:', err.message);

      // Sanitize file originalnames
      if (req.files) {
        Object.keys(req.files).forEach(fieldName => {
          if (Array.isArray(req.files[fieldName])) {
            req.files[fieldName].forEach(file => {
              if (file.originalname) {
                const sanitized = sanitizePublicId(file.originalname);
                file.originalname = sanitized;
                file.filename = sanitized;
                console.log(`  Sanitized: ${file.originalname} → ${sanitized}`);
              }
            });
          }
        });
      }

      // Retry upload with sanitized filenames
      return upload(req, res, handleUploadCallback);
    }

    return handleUploadCallback(err);
  });

  async function handleUploadCallback(err) {
    // Use shared error handler or fallback
    if (err) {
      // If the cloudinary module provides a custom handler, prefer it for richer behavior
      if (cloudinaryModule && cloudinaryModule.handleUploadError) {
        try { return cloudinaryModule.handleUploadError(err, req, res, next); } catch (handlerErr) { console.warn('cloudinary.handleUploadError failed:', handlerErr); }
      }

      // Fallback: don't fail the whole request. Instead, attach placeholder entries
      // so product creation can proceed while uploads are treated as best-effort.
      console.warn('⚠️ Upload error (fallback to placeholders):', err && err.message ? err.message : err);
      req.uploadFallback = true;
      req.uploadErrorMessage = err && (err.message || (err.original && err.original.message)) || String(err);

      // Build placeholders from req.files when available, otherwise keep empty arrays
      try {
        req.body = req.body || {};
        req.files = req.files || {};

        // Build images placeholders
        if (!req.body.images || req.body.images.length === 0) {
          req.body.images = [];
          if (req.files && Array.isArray(req.files.images) && req.files.images.length > 0) {
            for (let idx = 0; idx < req.files.images.length; idx++) {
              const file = req.files.images[idx];
              const placeholderId = `placeholder_image_${Date.now()}_${idx}`;
              const placeholderUrl = `https://via.placeholder.com/400x300?text=Image+${idx + 1}`;
              req.body.images.push({
                url: placeholderUrl,
                cloudinary_id: placeholderId,
                type: 'image',
                format: file.mimetype ? file.mimetype.split('/')[1] : 'jpg',
                size: file.size || 0,
                altText: file.originalname || `Placeholder Image ${idx + 1}`
              });
              // enqueue retry task (best-effort) and move file to durable storage
              try {
                const storedPath = await moveToRetryStorage(file.path, file._originalname || file.originalname);
                await uploadTaskRepo.createTask({
                  companyId: req.body.companyId || req.query.companyId,
                  shopId: req.body.shopId || req.query.shopId,
                  productId: req.body.productId || null,
                  field: 'images',
                  placeholderId,
                  placeholderUrl,
                  originalName: file.originalname,
                  folder: `products`,
                  publicIdHint: sanitizePublicId(file.originalname),
                  filePath: storedPath || null,
                  fileBase64: file.buffer ? file.buffer.toString('base64') : null
                }).catch(() => { });
              } catch (e) { }
            }
          }
        }

        // Build videos placeholders
        if (!req.body.videos || req.body.videos.length === 0) {
          req.body.videos = [];
          if (req.files && Array.isArray(req.files.videos) && req.files.videos.length > 0) {
            for (let idx = 0; idx < req.files.videos.length; idx++) {
              const file = req.files.videos[idx];
              const placeholderId = `placeholder_video_${Date.now()}_${idx}`;
              const placeholderUrl = `https://via.placeholder.com/400x300?text=Video+${idx + 1}`;
              req.body.videos.push({
                url: placeholderUrl,
                cloudinary_id: placeholderId,
                type: 'video',
                format: file.mimetype ? file.mimetype.split('/')[1] : 'mp4',
                size: file.size || 0,
                duration: null,
                thumbnail: `https://via.placeholder.com/400x300?text=Video+${idx + 1}`
              });
              try {
                const storedPath = await moveToRetryStorage(file.path, file._originalname || file.originalname);
                await uploadTaskRepo.createTask({
                  companyId: req.body.companyId || req.query.companyId,
                  shopId: req.body.shopId || req.query.shopId,
                  productId: req.body.productId || null,
                  field: 'videos',
                  placeholderId,
                  placeholderUrl,
                  originalName: file.originalname,
                  folder: `products`,
                  publicIdHint: sanitizePublicId(file.originalname),
                  filePath: storedPath || null,
                  fileBase64: file.buffer ? file.buffer.toString('base64') : null
                }).catch(() => { });
              } catch (e) { }
            }
          }
        }
      } catch (fallbackErr) {
        console.warn('Failed to build upload placeholders:', fallbackErr && fallbackErr.message ? fallbackErr.message : fallbackErr);
      }

      // Continue the request flow; caller can check `req.uploadFallback` to detect degraded upload
      return next();
    }

    // Process uploaded files: if cloudinary configured, upload the temp files using uploadBuffer
    req.body = req.body || {};
    if (req.files && cloudinaryModule && cloudinaryModule.cloudinary) {
      const images = req.files.images || [];
      const videos = req.files.videos || [];
      req.body.images = req.body.images || [];
      req.body.videos = req.body.videos || [];

      // Helper to perform a synchronous upload (default) or fallback to background on failure
      const doUpload = async (file, field) => {
        try {
          const buffer = await require('fs').promises.readFile(file.path);
          const folder = 'products';

          // Perform synchronous upload to Cloudinary
          const res = await uploadBuffer(buffer, folder);

          // Cleanup temp file
          try { if (file && file.path) await fs.promises.unlink(file.path); } catch (e) { /* ignore */ }

          if (field === 'images') {
            return {
              url: res.secure_url,
              cloudinary_id: res.public_id,
              type: 'image',
              format: res.format || (file.mimetype ? file.mimetype.split('/')[1] : 'jpg'),
              size: file.size || res.bytes || 0,
              altText: file._originalname || file.originalname
            };
          }
          return {
            url: res.secure_url,
            cloudinary_id: res.public_id,
            type: 'video',
            format: res.format || (file.mimetype ? file.mimetype.split('/')[1] : 'mp4'),
            size: file.size || res.bytes || 0,
            duration: res.duration || null,
            thumbnail: res.thumbnail_url || ''
          };
        } catch (err) {
          console.warn(`Sync upload failed for ${file.originalname}, falling back to background retry...`, err.message);

          const placeholderId = `placeholder_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
          const placeholderUrl = `https://via.placeholder.com/400x300?text=${encodeURIComponent(file._originalname || 'file_failed')}`;

          // Background path: enqueue for async processing
          setImmediate(async () => {
            try {
              const storedPath = await moveToRetryStorage(file.path, file._originalname || file.originalname);
              await uploadTaskRepo.createTask({
                companyId: req.body.companyId || req.query.companyId,
                shopId: req.body.shopId || req.query.shopId,
                productId: req.body.productId || null,
                field: field,
                placeholderId,
                placeholderUrl,
                originalName: file._originalname || file.originalname,
                folder: 'products',
                publicIdHint: sanitizePublicId(file._originalname || file.originalname || file.filename || 'file'),
                filePath: storedPath || null,
                fileBase64: null
              }).catch(() => { });
            } catch (e) { /* ignore */ }
          });

          if (field === 'images') return { url: placeholderUrl, cloudinary_id: placeholderId, type: 'image', format: 'jpg', size: file.size || 0, altText: file._originalname || file.originalname };
          return { url: placeholderUrl, cloudinary_id: placeholderId, type: 'video', format: 'mp4', size: file.size || 0, duration: null, thumbnail: placeholderUrl };
        }
      };

      // Upload images in parallel synchronously
      const imageResults = await Promise.allSettled(images.map(file => doUpload(file, 'images')));
      imageResults.forEach((result, idx) => {
        if (result.status === 'fulfilled' && result.value) {
          req.body.images.push(result.value);
        } else {
          console.warn(`Image upload processing failed for file ${idx}:`, result.reason?.message || result.reason);
        }
      });

      // Upload videos in parallel synchronously
      const videoResults = await Promise.allSettled(videos.map(file => doUpload(file, 'videos')));
      videoResults.forEach((result, idx) => {
        if (result.status === 'fulfilled' && result.value) {
          req.body.videos.push(result.value);
        } else {
          console.warn(`Video upload processing failed for file ${idx}:`, result.reason?.message || result.reason);
        }
      });
    } else {
      // No cloudinary configured: use existing behavior (placeholders or prefilled req.body)
      if (req.files) {
        if (req.files.images) {
          req.body.images = req.files.images.map(file => ({
            url: file.path,
            cloudinary_id: sanitizePublicId(file.filename || file.cloudinary_id || file.originalname),
            type: 'image',
            format: file.format || 'jpg',
            size: file.size || 0,
            altText: file.originalname || file.altText
          }));
        }
        if (req.files.videos) {
          req.body.videos = req.files.videos.map(file => ({
            url: file.path,
            cloudinary_id: sanitizePublicId(file.filename || file.cloudinary_id || file.originalname),
            type: 'video',
            format: file.format || 'mp4',
            size: file.size || 0,
            duration: file.duration || null,
            thumbnail: file.eager ? file.eager[0].secure_url : file.thumbnail || ''
          }));
        }
      }
    }

    next();
  }
};

/**
 * Sanitize folder and publicId for Cloudinary
 */
function sanitizeFolder(folder) {
  if (!folder) return '';
  // remove template placeholders like {productId} and trim spaces
  return String(folder).replace(/[{}]/g, '').replace(/productId/g, '').trim().replace(/\s+/g, '_');
}

function sanitizePublicId(id) {
  if (!id) return `id_${Date.now()}`;
  // normalize unicode to separate diacritics, then remove non-ascii accents
  let s = String(id).normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  // replace whitespace with hyphen
  s = s.replace(/\s+/g, '-');
  // remove characters that Cloudinary rejects in public_id (keep alnum, -, _, .)
  s = s.replace(/[^A-Za-z0-9\-_.]/g, '');
  // collapse multiple hyphens and trim
  s = s.replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!s) s = `id-${Date.now()}`;
  // enforce reasonable length to avoid backend rejections
  if (s.length > 200) s = s.substring(0, 200);
  return s;
}

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

  const safeFolder = sanitizeFolder(folder);

  return new Promise((resolve, reject) => {
    try {
      const uploadStream = cloudinaryModule.cloudinary.uploader.upload_stream(
        {
          folder: safeFolder,
          resource_type: 'auto'
        },
        (error, result) => {
          if (error) {
            // Provide clearer error context and surface http code when possible
            const wrapped = new Error(`Cloudinary upload failed for folder='${safeFolder}': ${error.message || error}`);
            wrapped.original = error;
            if (error.http_code) wrapped.http_code = error.http_code;
            else if (error.status) wrapped.http_code = error.status;
            return reject(wrapped);
          }
          resolve(result);
        }
      );
      streamifier.createReadStream(buffer).pipe(uploadStream);
    } catch (err) {
      reject(new Error(`Cloudinary upload exception: ${err.message || err}`));
    }
  });
};

// Export with conditional cloudinary
const moduleExports = {
  handleUploads,
  sanitizeFilenamesPreprocessor,
  uploadBuffer,
  deleteFile: (cloudinaryModule && cloudinaryModule.deleteFile) || (() => Promise.resolve())
};

// Only export cloudinary if available
if (cloudinaryModule && cloudinaryModule.cloudinary) {
  moduleExports.cloudinary = cloudinaryModule.cloudinary;
}

module.exports = moduleExports;