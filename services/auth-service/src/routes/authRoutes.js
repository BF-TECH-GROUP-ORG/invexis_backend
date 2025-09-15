const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { upload, uploadToLocal } = require('../middleware/upload');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/register', upload.single('profilePicture'), uploadToLocal, authController.register);
router.post('/login', authController.login);
router.post('/login/fingerprint', authController.loginWithFingerprint);

router.get('/me', (req, res) => {
    res.json({ message: 'Auth service is running' });
})

module.exports = router;