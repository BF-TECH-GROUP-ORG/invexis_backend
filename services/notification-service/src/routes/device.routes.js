const express = require('express');
const router = express.Router();
const deviceController = require('../controllers/deviceController');
// Assuming we have auth middleware available in the service or passed from gateway
// Since this is a microservice, usually the Gateway handles Auth, but we might want to check for user headers
// For now, we'll implement a helper to extract user from headers if not present

// Middleware to ensure req.user exists from Gateway headers
const extractUser = (req, res, next) => {
    if (req.user) return next();

    const userId = req.headers['x-user-id'];
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized: Missing User Context' });
    }

    req.user = {
        id: userId,
        email: req.headers['x-user-email'],
        role: req.headers['x-user-role']
    };
    next();
};

router.post('/register', extractUser, deviceController.registerDevice);
router.delete('/:fcmToken', extractUser, deviceController.unregisterDevice);
router.get('/', extractUser, deviceController.listDevices);

module.exports = router;
