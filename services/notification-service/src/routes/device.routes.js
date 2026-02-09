const express = require('express');
const router = express.Router();
const deviceController = require('../controllers/deviceController');
// Use centralized production auth middleware
const { authenticateToken } = require('/app/shared/middlewares/auth/production-auth');

router.post('/register', authenticateToken, deviceController.registerDevice);
router.delete('/:fcmToken', authenticateToken, deviceController.unregisterDevice);
router.get('/', authenticateToken, deviceController.listDevices);

module.exports = router;
