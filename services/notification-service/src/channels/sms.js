// src/channels/sms.js
const client = require('../config/sms');
const logger = require('../utils/logger');

const sendSMS = async (notification, phoneNumber) => {
    try {
        await client.messages.create({
            body: `${notification.title}: ${notification.body.substring(0, 160)}`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phoneNumber
        });
        logger.info(`SMS sent to ${phoneNumber}`);
        return true;
    } catch (error) {
        logger.error('SMS send error:', error);
        return false;
    }
};

module.exports = { sendSMS };