// src/services/dispatcher.js
const Notification = require('../models/Notification');
const Template = require('../models/Template');
const { notificationEventSchema } = require('../utils/validator');
const { compileTemplatesForChannels } = require('./templateService');
const notificationQueue = require('../config/queue');
const logger = require('../utils/logger');
const { eventChannelMapping } = require('../config/eventChannelMapping');

const dispatchEvent = async (eventPayload) => {
    console.log(`🚀 [Dispatcher] dispatchEvent ENTRY - event: ${eventPayload.event}, template: ${eventPayload.templateName}`);
    console.log(`🚀 [Dispatcher] Recipients: ${eventPayload.recipients?.length || 0}, companyId: ${eventPayload.companyId || 'NONE'}`);

    const { error } = notificationEventSchema.validate(eventPayload);
    if (error) {
        const errorDetail = error.details[0];
        const errorInfo = {
            message: errorDetail.message,
            path: errorDetail.path?.join('.'),
            type: errorDetail.type,
            context: errorDetail.context,
            invalidValue: errorDetail.context?.value,
            payload: eventPayload
        };
        console.error(`❌ [Dispatcher] Validation FAILED:`, JSON.stringify(errorInfo, null, 2));
        logger.error('Invalid event payload - validation failed:', errorInfo);
        return false;
    }
    console.log(`✅ [Dispatcher] Validation passed`);


    let { event, data: payload, recipients, companyId, templateName, channels, priority } = eventPayload;

    // Apply event mapping if channels are not explicitly provided
    if ((!channels || channels.length === 0) && eventChannelMapping[event]) {
        const mapping = eventChannelMapping[event];
        channels = mapping.channels;
        if (!priority) priority = mapping.priority;
        logger.info(`Applied channel mapping for event ${event}: ${channels.join(', ')} (Priority: ${priority})`);
    }

    // Normalize channels (in-app -> inApp)
    if (channels) {
        channels = channels.map(c => c === 'in-app' ? 'inApp' : c);
    }

    // Fallback to default if still no channels
    if (!channels || channels.length === 0) {
        console.log(`⚠️  [Dispatcher] No channels specified, using default: inApp`);
        channels = ['inApp']; // Default fallback
    }
    console.log(`📡 [Dispatcher] Channels to use: ${channels.join(', ')}`);


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
            channels: {
                email: channels.includes('email'),
                sms: channels.includes('sms'),
                push: channels.includes('push'),
                inApp: channels.includes('inApp')
            },
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

    let { event, data: payload, companyId, shopId, templateName, channels, scope, departmentId, roles, priority } = eventPayload;

    // Apply event mapping if channels are not explicitly provided
    if ((!channels || channels.length === 0) && eventChannelMapping[event]) {
        const mapping = eventChannelMapping[event];
        channels = mapping.channels;
        if (!priority) priority = mapping.priority;
        logger.info(`Applied channel mapping for broadcast event ${event}: ${channels.join(', ')} (Priority: ${priority})`);
    }

    // Normalize channels (in-app -> inApp)
    if (channels) {
        channels = channels.map(c => c === 'in-app' ? 'inApp' : c);
    }

    // Fallback to default if still no channels
    if (!channels || channels.length === 0) {
        channels = ['inApp']; // Default fallback
    }

    // Validate templates (skipped - using local registry for now)
    /*
    const templateValidation = await Template.validateTemplatesExist(templateName, channels);
    if (!templateValidation.isValid) {
        logger.warn(`Missing templates for ${templateName}:`, templateValidation.missingChannels);
    }
    */

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
        channels: {
            email: channels.includes('email'),
            sms: channels.includes('sms'),
            push: channels.includes('push'),
            inApp: channels.includes('inApp')
        },
        priority: priority || 'normal',
        compiledContent,
        companyId,
        shopId,
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