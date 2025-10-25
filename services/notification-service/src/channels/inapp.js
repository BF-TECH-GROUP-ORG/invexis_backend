// src/channels/inApp.js
const socket = require('../config/socket');
const logger = require('../utils/logger');

const sendInApp = async (notification, userId) => {
    try {
        socket.emit('notification', {
            userId,
            notification: {
                id: notification._id,
                title: notification.title,
                body: notification.body,
                type: 'inApp'
            }
        });
        logger.info(`In-app sent to user ${userId}`);
        return true;
    } catch (error) {
        logger.error('In-app send error:', error);
        return false;
    }
};

module.exports = { sendInApp };