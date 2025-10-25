// src/queue/workers.js
const Notification = require('../models/Notification');
const { getPreferences } = require('../services/preferenceService');
const { sendEmail } = require('../channels/email');
const { sendSMS } = require('../channels/sms');
const { sendPush } = require('../channels/push');
const { sendInApp } = require('../channels/inapp');
const logger = require('../utils/logger');

const deliverNotification = async ({ notificationId }) => {
    const notification = await Notification.findById(notificationId);
    if (!notification) {
        throw new Error('Notification not found');
    }

    const userId = notification.userId.toString();
    const companyId = notification.companyId.toString();
    const prefs = await getPreferences(userId, companyId);

    let successes = 0;
    const results = [];

    // Email
    if (notification.channels.email && prefs.email) {
        // Assume email in payload
        const success = await sendEmail(notification, notification.payload.email);
        results.push({ channel: 'email', success });
        if (success) successes++;
    }

    // SMS
    if (notification.channels.sms && prefs.sms) {
        const success = await sendSMS(notification, notification.payload.phone);
        results.push({ channel: 'sms', success });
        if (success) successes++;
    }

    // Push
    if (notification.channels.push && prefs.push) {
        const success = await sendPush(notification, notification.payload.fcmToken);
        results.push({ channel: 'push', success });
        if (success) successes++;
    }

    // In-App
    if (notification.channels.inApp && prefs.inApp) {
        const success = await sendInApp(notification, userId);
        results.push({ channel: 'inApp', success });
        if (success) successes++;
    }

    // Update status
    notification.status = successes === results.length ? 'sent' : 'failed';
    await notification.save();

    logger.info(`Delivery for ${notificationId}: ${successes}/${results.length} successful`);

    if (notification.status === 'failed') {
        throw new Error(`Delivery failed for ${results.length - successes} channels`);
    }

    return results;
};

module.exports = { deliverNotification };