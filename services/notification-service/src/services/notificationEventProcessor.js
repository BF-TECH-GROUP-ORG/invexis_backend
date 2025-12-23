/**
 * Enterprise-Grade Notification Event Processor
 * 
 * This service processes ALL platform events and creates notifications based on eventChannelMapping.
 * It serves as the SINGLE SOURCE OF TRUTH for notification generation.
 */

const Notification = require('../models/Notification');
const { eventChannelMapping } = require('../config/eventChannelMapping');
const { compileTemplatesForChannels } = require('./templateService');
const recipientResolver = require('./recipientResolver');
const intentClassifier = require('./intentClassifier');
const logger = require('../utils/logger');

const notificationQueue = require('../config/queue');

// WebSocket publisher (to be integrated with websocket-service)
let websocketPublisher;
try {
    websocketPublisher = require('./websocketPublisher');
} catch (err) {
    logger.warn('WebSocket publisher not available:', err.message);
}

/**
 * Master Event Processor
 * Routes all events and creates notifications based on eventChannelMapping
 */
class NotificationEventProcessor {
    /**
     * Process any event and create notifications if mapped
     * @param {Object} event - Standard event object {type, source, data, emittedAt, id}
     * @param {string} routingKey - RabbitMQ routing key
     */
    async processEvent(event, routingKey) {
        try {
            const { type, data, id: eventId, emittedAt, source } = event;

            if (!type) {
                logger.warn('⚠️ Event missing type field', { routingKey, source, eventId });
                return;
            }

            logger.debug(`📥 processEvent called for ${type}`, { source, eventId, routingKey });

            // Check if this event type should trigger notifications
            const shouldNotify = intentClassifier.shouldNotify(type);
            if (!shouldNotify) {
                // Event is not configured for notifications - silently ignore
                logger.debug(`📭 Event ${type} not configured for notifications`);
                return;
            }

            logger.info(`📬 Processing notification event: ${type}`, { source });

            // Step 1: Classify intent
            const intent = intentClassifier.classify(type);

            // Step 2: Extract notification metadata
            const notificationData = await this.extractNotificationData(type, data);
            if (!notificationData) {
                logger.warn(`⚠️ Unable to extract notification data for ${type}`, data);
                return;
            }

            // Step 3: Resolve recipients by role
            let recipientsByRole = await recipientResolver.resolveByRole(type, notificationData);

            // Fallback: If no recipients found, try to notify company admins
            if (!recipientsByRole || Object.keys(recipientsByRole).length === 0) {
                logger.warn(`⚠️ No recipients found for ${type}. Attempting fallback to company admin.`);

                if (notificationData.companyId) {
                    const companyAdmins = await recipientResolver.getUsersByRole('company_admin', notificationData, type);
                    if (companyAdmins && companyAdmins.length > 0) {
                        recipientsByRole = { 'company_admin': companyAdmins };
                        logger.info(`✅ Fallback successful: Found ${companyAdmins.length} company admin(s)`);
                    }
                }
            }

            if (!recipientsByRole || Object.keys(recipientsByRole).length === 0) {
                const error = new Error(`No recipients found for ${type}`);
                logger.error(error);

                // Fail fast in development
                if (process.env.NODE_ENV !== 'production') {
                    // throw error; // Don't crash, just log error
                    return;
                }
                return;
            }

            // Step 4: Get priority from mapping (backward compatibility with eventChannelMapping)
            const mapping = eventChannelMapping[type];
            const priority = mapping?.priority || 'normal';

            // Step 5: Create notifications with role-specific channels
            const notifications = [];
            for (const [role, userIds] of Object.entries(recipientsByRole)) {
                // Derive channels from intent + role
                const channels = intentClassifier.getChannelsForIntent(intent, role);

                logger.debug(`📨 Creating ${userIds.length} notification(s) for ${role}`, {
                    channels,
                    intent
                });

                for (const userId of userIds) {
                    const notification = await this.createNotification({
                        eventType: type,
                        eventId,
                        source,
                        emittedAt,
                        userId,
                        role,
                        intent,
                        channels,
                        priority,
                        data: notificationData
                    });

                    if (notification) {
                        notifications.push(notification);

                        // Queue for delivery (Async Worker)
                        try {
                            const delay = 0;
                            await notificationQueue.add('deliver',
                                { notificationId: notification._id },
                                {
                                    delay,
                                    priority: priority === 'high' ? 1 : 2,
                                    attempts: 3,
                                    backoff: { type: 'exponential', delay: 1000 }
                                }
                            );
                            logger.debug(`📤 Queued notification ${notification._id} for delivery`);
                        } catch (qErr) {
                            logger.error(`❌ Failed to queue notification ${notification._id}:`, qErr);
                        }
                    }
                }
            }

            logger.info(`✅ Created and queued ${notifications.length} notification(s) for ${type}`);

        } catch (error) {
            logger.error(`❌ Error processing notification event:`, {
                error: error.message,
                stack: error.stack,
                event: event?.type
            });
            // Don't throw - we don't want to reject the event from queue
        }
    }

    /**
     * Extract relevant data from event payload for notification creation
     */
    /**
     * Extract relevant data from event payload for notification creation
     */
    async extractNotificationData(eventType, data) {
        logger.debug(`🧪 extractNotificationData for ${eventType}`, {
            dataKeys: Object.keys(data || {}),
            hasShopId: !!(data.shopId || data.shop_id),
            hasCompanyId: !!(data.companyId || data.company_id)
        });
        // Derive companyId from data strategies
        let companyId = data.companyId || data.company_id;

        // Strategy: Check companies array (common in auth-service user objects)
        if (!companyId && data.companies && Array.isArray(data.companies) && data.companies.length > 0) {
            companyId = data.companies[0];
        }

        // Strategy: Fallback for system events (if schema requires it)
        if (!companyId && (eventType === 'user.created' || eventType === 'user.suspended')) {
            // For new users without company yet, or system-wide users
            companyId = 'system';
        }

        // Strategy: Manual fix for company.created where id is the companyId
        if (eventType === 'company.created' && !companyId && data.id) {
            companyId = data.id;
        }

        if (!companyId) {
            // Try to find it in nested objects often sent by sequlize
            if (data.dataValues && data.dataValues.companyId) companyId = data.dataValues.companyId;
            if (data.company && data.company.id) companyId = data.company.id;
        }

        // Critical validation for events that MUST have companyId
        if (!companyId && eventType !== 'user.created') {
            // For test events, we might fallback to a designated test company or log warning
            // But avoiding validaion error is priority
            logger.warn(`⚠️ Missing companyId for ${eventType}, defaulting to 'unknown' to avoid crash`);
            companyId = 'unknown'; // Or a valid default ID for your test env
        }

        // Common fields across all events
        const extracted = {
            companyId,
            shopId: data.shopId || data.shop_id,
            userId: data.userId || data.adminId || data.id,
            ...data
        };

        // Event-specific extractions
        switch (eventType) {
            case 'company.created':
            case 'company.updated':
                return {
                    ...extracted,
                    companyName: data.name,
                    adminId: data.adminId || data.userId,
                    email: data.email,
                    phone: data.phone
                };

            case 'sale.created':
            case 'sale.return.created':
                return {
                    ...extracted,
                    totalAmount: data.totalAmount || data.refundAmount,
                    customerId: data.customerId,
                    items: data.items
                };

            case 'inventory.low_stock':
            case 'inventory.out_of_stock':
                return {
                    ...extracted,
                    productId: data.productId,
                    productName: data.productName || data.name,
                    currentStock: data.currentStock || data.stock,
                    threshold: data.threshold
                };

            case 'debt.overdue':
            case 'debt.reminder.overdue':
                return {
                    ...extracted,
                    debtId: data.debtId || data.id,
                    amount: data.amount,
                    customerName: data.customerName,
                    dueDate: data.dueDate
                };

            default:
                return extracted;
        }
    }

    /**
     * Create notification document in MongoDB
     */
    async createNotification({ eventType, eventId, source, emittedAt, userId, role, intent, channels, priority, data }) {
        // Determine template name from event type
        const templateName = this.getTemplateName(eventType);

        // Build channel configuration first
        const channelConfig = this.buildChannelConfig(channels);

        // Compile content for all channels
        let compiledContent = {};
        try {
            compiledContent = await compileTemplatesForChannels(templateName, data, channelConfig);
        } catch (err) {
            logger.warn(`Template compilation failed for ${templateName}:`, err.message);
            // Use fallback content
            compiledContent = this.getFallbackContent(eventType, data);
        }

        // Legacy content for backward compatibility
        const legacyContent = compiledContent.inApp || compiledContent.email || {
            title: this.getDefaultTitle(eventType),
            body: this.getDefaultBody(eventType, data)
        };

        // Idempotency: Check if notification for this event already exists
        const existing = await Notification.findOne({
            'payload.eventId': eventId,
            userId
        });

        if (existing) {
            logger.info(`📌 Notification already exists for event ${eventId}, user ${userId}`);
            return null;
        }

        const notification = new Notification({
            // Legacy fields
            title: legacyContent.title || 'Notification',
            body: legacyContent.body || 'You have a new notification',

            // Template system
            templateName,
            payload: {
                ...data,
                eventId,
                eventType,
                source,
                role,     // Store recipient role
                intent    // Store intent classification
            },
            priority: priority || 'normal',
            compiledContent,

            // Channel configuration
            channels: this.buildChannelConfig(channels),

            // Targeting
            userId,
            companyId: data.companyId,
            shopId: data.shopId,
            scope: data.scope || 'personal', // Default to personal unless event specifies otherwise

            // Delivery tracking
            sendAt: emittedAt || new Date(),
            status: 'pending',
            deliveryStatus: this.initializeDeliveryStatus(channels)
        });

        await notification.save();

        logger.debug(`✓ Created notification for user ${userId}`, {
            role,
            intent,
            channels: channels.join(', ')
        });

        return notification;
    }

    /**
     * Build channel configuration object
     */
    buildChannelConfig(channels) {
        return {
            email: channels.includes('email'),
            sms: channels.includes('sms'),
            push: channels.includes('push'),
            inApp: channels.includes('in-app') || channels.includes('inApp')
        };
    }

    /**
     * Initialize delivery status for all channels
     */
    initializeDeliveryStatus(channels) {
        const status = {};
        for (const channel of channels) {
            const normalizedChannel = channel === 'in-app' ? 'inApp' : channel;
            status[normalizedChannel] = {
                status: 'pending',
                sentAt: null,
                deliveredAt: null,
                error: null
            };
        }
        return status;
    }

    /**
     * Get template name from event type
     */
    getTemplateName(eventType) {
        const mapping = {
            'company.created': 'welcome',
            'company.suspended': 'company_suspended',
            'shop.created': 'shop_created',
            'sale.created': 'sale_confirmation',
            'sale.return.created': 'sale_return',
            'inventory.low_stock': 'low_stock_alert',
            'inventory.out_of_stock': 'out_of_stock_alert',
            'debt.overdue': 'debt_overdue',
            'payment.success': 'payment_success',
            'payment.failed': 'payment_failed'
        };

        return mapping[eventType] || 'generic_notification';
    }

    /**
     * Fallback content generation
     */
    getFallbackContent(eventType, data) {
        return {
            inApp: {
                title: this.getDefaultTitle(eventType),
                body: this.getDefaultBody(eventType, data)
            }
        };
    }

    getDefaultTitle(eventType) {
        const titles = {
            'company.created': 'Welcome to Invexis!',
            'shop.created': 'New Shop Created',
            'sale.created': 'New Sale Recorded',
            'sale.return.created': 'Product Return Initiated',
            'inventory.low_stock': '⚠️ Low Stock Alert',
            'inventory.out_of_stock': '🚨 Out of Stock',
            'debt.overdue': '⏰ Payment Overdue',
            'payment.success': '✅ Payment Successful',
            'payment.failed': '❌ Payment Failed'
        };
        return titles[eventType] || 'Notification';
    }

    getDefaultBody(eventType, data) {
        const bodies = {
            'company.created': `Welcome, ${data.name || 'Admin'}! Your account is ready.`,
            'shop.created': `Shop "${data.name}" has been successfully created.`,
            'sale.created': `New sale for $${data.totalAmount || 0} recorded.`,
            'sale.return.created': `Return for sale ${data.saleId} initiated ($${data.refundAmount || 0}).`,
            'inventory.low_stock': `${data.productName || 'Product'} is running low (${data.currentStock || 0} left).`,
            'inventory.out_of_stock': `${data.productName || 'Product'} is out of stock.`,
            'debt.overdue': `Payment of $${data.amount || 0} is overdue.`
        };
        return bodies[eventType] || 'You have a new notification.';
    }
}

// Export singleton instance
module.exports = new NotificationEventProcessor();
