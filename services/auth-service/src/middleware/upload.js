const multer = require('multer');
const path = require('path');
const logger = require('../utils/app');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, `${Date.now()}-${file.originalname}`);
    },
});

const upload = multer({ storage });

const uploadToLocal = async (req, res, next) => {
    if (!req.file) return next();

    const filePath = path.join('uploads', req.file.filename);
    req.body.profilePicture = { url: filePath, publicId: req.file.filename }; // Store local path
    next();
};

module.exports = { upload, uploadToLocal };