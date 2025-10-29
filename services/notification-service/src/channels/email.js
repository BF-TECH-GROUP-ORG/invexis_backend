// src/channels/email.js
const transporter = require('../config/email');
const logger = require('../utils/logger');

const sendEmail = async (notification, userEmail) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_FROM,
            to: userEmail,
            subject: notification.title,
            html: notification.body
        };

        await transporter.sendMail(mailOptions);
        logger.info(`Email sent to ${userEmail}`);
        return true;
    } catch (error) {
        logger.error('Email send error:', error);
        return false;
    }
};

module.exports = { sendEmail };