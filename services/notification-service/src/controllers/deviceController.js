const UserDevice = require('../models/UserDevice');
const logger = require('../utils/logger');

class DeviceController {
    /**
     * Register or update a device token
     */
    async registerDevice(req, res) {
        try {
            const { fcmToken, deviceType, deviceName } = req.body;
            // Assuming auth middleware populates req.user
            const userId = req.user.id || req.user._id;

            if (!fcmToken) {
                return res.status(400).json({ error: 'Missing fcmToken' });
            }

            // Upsert: Update if exists, Insert if new
            const device = await UserDevice.findOneAndUpdate(
                { fcmToken },
                {
                    userId,
                    fcmToken,
                    deviceType: deviceType || 'android',
                    deviceName,
                    isActive: true,
                    lastActiveAt: new Date()
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            logger.info(`📱 Device registered for user ${userId}: ${deviceType}`);

            res.json({
                success: true,
                message: 'Device registered successfully',
                device
            });
        } catch (error) {
            logger.error('Error registering device:', error);
            res.status(500).json({ error: 'Failed to register device' });
        }
    }

    /**
     * Unregister a device (e.g., on logout)
     */
    async unregisterDevice(req, res) {
        try {
            const { fcmToken } = req.params;
            const userId = req.user.id || req.user._id;

            if (!fcmToken) {
                return res.status(400).json({ error: 'Missing fcmToken' });
            }

            // Only allow user to remove their own device (or admin)
            // Ideally we check if the token belongs to the user, but for now we just try deletion
            const result = await UserDevice.findOneAndDelete({ fcmToken, userId });

            if (!result) {
                return res.status(404).json({ error: 'Device not found or not owned by user' });
            }

            logger.info(`📱 Device unregistered for user ${userId}`);

            res.json({
                success: true,
                message: 'Device unregistered successfully'
            });
        } catch (error) {
            logger.error('Error unregistering device:', error);
            res.status(500).json({ error: 'Failed to unregister device' });
        }
    }

    /**
     * List user devices
     */
    async listDevices(req, res) {
        try {
            const userId = req.user.id || req.user._id;
            const devices = await UserDevice.find({ userId, isActive: true });
            res.json({ devices });
        } catch (error) {
            logger.error('Error listing devices:', error);
            res.status(500).json({ error: 'Failed to list devices' });
        }
    }
}

module.exports = new DeviceController();
