// src/channels/push.js
const messaging = require('../config/push');
const logger = require('../utils/logger');

const sendPush = async (notification, fcmToken) => {
    try {
        const message = {
            notification: {
                title: notification.title,
                body: notification.body
            },
            token: fcmToken
        };

        await messaging.send(message);
        logger.info(`Push sent to token ${fcmToken.substring(0, 10)}...`);
        return true;
    } catch (error) {
        logger.error('Push send error:', error);
        return false;
    }
};

module.exports = { sendPush };