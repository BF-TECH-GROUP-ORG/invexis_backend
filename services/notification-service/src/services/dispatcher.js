// src/services/dispatcher.js
const Notification = require('../models/Notification');
const { notificationEventSchema } = require('../utils/validator');
const { compileTemplate } = require('./templateService');
const notificationQueue = require('../config/queue');
const logger = require('../utils/logger');

const dispatchEvent = async (eventPayload) => {
    const { error } = notificationEventSchema.validate(eventPayload);
    if (error) {
        logger.error('Invalid event payload:', error.details[0].message);
        return false;
    }

    const { event, data: payload, recipients, companyId, templateName, channels } = eventPayload;

    // Compile template for all (shared)
    const { title, body } = await compileTemplate(templateName, payload);

    // Create notification for each recipient (personalized if needed)
    const jobs = [];
    for (const userId of recipients) {
        const notification = new Notification({
            title,
            body,
            templateName,
            payload,
            channels,
            userId,
            companyId,
            scope: 'personal', // Assume personal for recipients list; adjust for broadcast
            status: 'pending'
        });

        await notification.save();

        // Queue delivery with delay if sendAt
        const delay = notification.sendAt > new Date() ? notification.sendAt - new Date() : 0;
        jobs.push(notificationQueue.add('deliver', { notificationId: notification._id }, { delay }));
    }

    logger.info(`Dispatched ${recipients.length} notifications for event ${event}`);
    return jobs;
};

module.exports = { dispatchEvent };