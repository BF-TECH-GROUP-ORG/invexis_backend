const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = process.env.UPLOAD_PATH || './uploads/profiles';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `profile-${req.user._id}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only images allowed'), false);
    }
};

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter
});

const uploadProfileImage = (req, res, next) => {
    upload.single('profilePicture')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ ok: false, message: err.message });
        }
        if (!req.file) {
            return res.status(400).json({ ok: false, message: 'No file uploaded' });
        }
        req.profilePictureUrl = `/uploads/${req.file.filename}`;
        next();
    });
};

module.exports = { uploadProfileImage };