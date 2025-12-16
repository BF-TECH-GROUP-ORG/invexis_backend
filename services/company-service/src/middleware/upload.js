const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const CloudinaryStorage = require('multer-storage-cloudinary');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure Cloudinary storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // Get company ID from params
    const companyId = req.params.id;

    // Determine file format based on mimetype
    let format;
    if (file.mimetype === 'application/pdf') {
      format = 'pdf';
    } else if (file.mimetype.startsWith('image/')) {
      format = file.mimetype.split('/')[1]; // jpeg, png, etc.
    } else {
      format = 'auto';
    }

    return {
      folder: `verification-docs/${companyId}`,
      format: format,
      resource_type: 'auto', // Automatically detect resource type (image, raw, video)
      public_id: `${Date.now()}-${file.originalname.split('.')[0]}`,
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx'],
    };
  },
});

// File filter - only allow certain file types
const fileFilter = (req, file, cb) => {
  // Allowed file types for verification documents
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, PDF, DOC, and DOCX files are allowed.'), false);
  }
};

// Configure multer with Cloudinary storage
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
});

module.exports = upload;

