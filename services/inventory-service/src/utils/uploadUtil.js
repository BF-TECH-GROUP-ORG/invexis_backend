const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

// File filter to allow only images and videos
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|webm/;
  const mimetype = allowedTypes.test(file.mimetype);
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());

  if (mimetype && extname) {
    return cb(null, true);
  }
  cb(new Error('Only images (jpeg, jpg, png, gif) and videos (mp4, mov, avi, webm) are allowed'));
};

// Multer upload instance
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit per file
}).fields([
  { name: 'images', maxCount: 10 }, // Allow up to 10 images
  { name: 'videos', maxCount: 5 }   // Allow up to 5 videos
]);

// Upload handler function
const handleUploads = (req, res, next) => {
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({
        success: false,
        message: 'Upload error',
        error: err.message
      });
    } else if (err) {
      return res.status(400).json({
        success: false,
        message: 'File type error',
        error: err.message
      });
    }

    // Process uploaded files and add to req.body if needed
    if (req.files) {
      if (req.files.images) {
        req.body.images = req.files.images.map(file => ({
          url: `/uploads/${file.filename}`,
          type: 'image',
          altText: file.originalname
        }));
      }
      if (req.files.videos) {
        req.body.videos = req.files.videos.map(file => ({
          url: `/uploads/${file.filename}`,
          type: 'video',
          thumbnail: ''
        }));
      }
    }

    next();
  });
};

module.exports = { handleUploads };