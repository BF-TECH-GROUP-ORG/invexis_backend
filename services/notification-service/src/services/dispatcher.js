// src/services/dispatcher.js
const Notification = require('../models/Notification');
const Template = require('../models/Template');
const { notificationEventSchema } = require('../utils/validator');
const { compileTemplatesForChannels } = require('./templateService');
const notificationQueue = require('../config/queue');
const logger = require('../utils/logger');
const { eventChannelMapping } = require('../config/eventChannelMapping');

const dispatchEvent = async (eventPayload) => {
    const { error } = notificationEventSchema.validate(eventPayload);
    if (error) {
        logger.error('Invalid event payload:', error.details[0].message);
        return false;
    }

    let { event, data: payload, recipients, companyId, templateName, channels, priority } = eventPayload;

    // Apply event mapping if channels are not explicitly provided
    if ((!channels || channels.length === 0) && eventChannelMapping[event]) {
        const mapping = eventChannelMapping[event];
        channels = mapping.channels;
        if (!priority) priority = mapping.priority;
        logger.info(`Applied channel mapping for event ${event}: ${channels.join(', ')} (Priority: ${priority})`);
    }

    // Fallback to default if still no channels
    if (!channels || channels.length === 0) {
        channels = ['in-app']; // Default fallback
    }

    // --- TIER ENFORCEMENT START ---
    // Remove channels not allowed by the company's subscription tier
    const { filterAllowedChannels } = require('../utils/subscriptionHelper');
    const originalChannels = [...channels];
    channels = await filterAllowedChannels(companyId, channels);

    if (channels.length < originalChannels.length) {
        const removed = originalChannels.filter(c => !channels.includes(c));
        logger.warn(`Channels ${removed.join(', ')} restricted for company ${companyId} due to tier limits.`);
    }
    // --- TIER ENFORCEMENT END ---

    // Template validation skipped (using local registry)
    // const templateValidation = await Template.validateTemplatesExist(templateName, channels);

    // Compile templates for all enabled channels
    const compiledContent = await compileTemplatesForChannels(templateName, payload, channels);

    // Get legacy title and body for backward compatibility
    const legacyContent = compiledContent.inApp || compiledContent.email ||
        Object.values(compiledContent)[0] ||
        { title: "Notification", body: "You have a new notification." };

    // Create notification for each recipient (personalized if needed)
    const jobs = [];
    for (const userId of recipients) {
        const notification = new Notification({
            // Legacy fields for backward compatibility
            title: legacyContent.title || legacyContent.subject || "Notification",
            body: legacyContent.body || legacyContent.html || legacyContent.message || "You have a new notification.",

            // New template system
            templateName,
            payload,
            channels,
            priority: priority || 'normal',
            compiledContent, // Store channel-specific compiled content

            // Targeting
            userId,
            companyId,
            scope: 'personal', // Assume personal for recipients list; adjust for broadcast
            status: 'pending'
        });

        await notification.save();

        // Queue delivery with delay if sendAt
        const delay = notification.sendAt > new Date() ? notification.sendAt - new Date() : 0;
        jobs.push(notificationQueue.add('deliver', { notificationId: notification._id }, { delay, priority: priority === 'high' ? 1 : undefined }));
    }

    logger.info(`Dispatched ${recipients.length} notifications for event ${event} with templates for channels: ${Object.keys(compiledContent).join(', ')}`);
    return jobs;
};

/**
 * Dispatch notification for multiple scopes (company, department, role-based)
 */
const dispatchBroadcastEvent = async (eventPayload) => {
    const { error } = notificationEventSchema.validate(eventPayload);
    if (error) {
        logger.error('Invalid broadcast event payload:', error.details[0].message);
        return false;
    }

    let { event, data: payload, companyId, templateName, channels, scope, departmentId, roles, priority } = eventPayload;

    // Apply event mapping if channels are not explicitly provided
    if ((!channels || channels.length === 0) && eventChannelMapping[event]) {
        const mapping = eventChannelMapping[event];
        channels = mapping.channels;
        if (!priority) priority = mapping.priority;
        logger.info(`Applied channel mapping for broadcast event ${event}: ${channels.join(', ')} (Priority: ${priority})`);
    }

    // Fallback to default if still no channels
    if (!channels || channels.length === 0) {
        channels = ['in-app']; // Default fallback
    }

    // Validate templates
    const templateValidation = await Template.validateTemplatesExist(templateName, channels);
    if (!templateValidation.isValid) {
        logger.warn(`Missing templates for ${templateName}:`, templateValidation.missingChannels);
    }

    // Compile templates
    const compiledContent = await compileTemplatesForChannels(templateName, payload, channels);

    // Get legacy content
    const legacyContent = compiledContent.inApp || compiledContent.email ||
        Object.values(compiledContent)[0] ||
        { title: "Notification", body: "You have a new notification." };

    // Create broadcast notification
    const notification = new Notification({
        title: legacyContent.title || legacyContent.subject || "Notification",
        body: legacyContent.body || legacyContent.html || legacyContent.message || "You have a new notification.",
        templateName,
        payload,
        channels,
        priority: priority || 'normal',
        compiledContent,
        companyId,
        departmentId,
        roles,
        scope: scope || 'company',
        status: 'pending'
    });

    await notification.save();

    // Queue delivery
    const job = notificationQueue.add('deliver', { notificationId: notification._id }, { priority: priority === 'high' ? 1 : undefined });

    logger.info(`Dispatched broadcast notification for event ${event} with scope ${scope}`);
    return [job];
};

module.exports = { dispatchEvent, dispatchBroadcastEvent };