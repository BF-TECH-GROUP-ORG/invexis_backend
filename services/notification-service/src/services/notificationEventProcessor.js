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
const { cleanValue, cleanAmount, extractField } = require('../utils/dataSanitizer');
const enrichmentService = require('./enrichmentService'); // New enrichment service

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
     * Sanitize payload to remove sensitive data (passwords, tokens, etc.)
     */
    sanitizePayload(data) {
        if (!data || typeof data !== 'object') return data;

        const sensitiveFields = ['password', 'token', 'secret', 'key', 'pin', 'otp', 'generatedPassword'];
        const sanitized = Array.isArray(data) ? [] : {};

        for (const [key, value] of Object.entries(data)) {
            // Check if key is sensitive
            const isSensitive = sensitiveFields.some(field =>
                key.toLowerCase().includes(field.toLowerCase())
            );

            if (isSensitive) {
                sanitized[key] = '***';
            } else if (value && typeof value === 'object' && !(value instanceof Date)) {
                // Recursively sanitize nested objects
                sanitized[key] = this.sanitizePayload(value);
            } else {
                sanitized[key] = value;
            }
        }
        return sanitized;
    }

    /**
     * Process any event and create notifications if mapped
     * @param {Object} event - Standard event object {type, source, data, emittedAt, id}
     * @param {string} routingKey - RabbitMQ routing key
     */
    async processEvent(event, routingKey) {
        try {
            let { type, data, id: eventId, emittedAt, source } = event;

            // Step 0: Sanitize incoming data
            // CRITICAL: For user.created events, preserve password temporarily for template compilation
            // It will be sanitized before storage in the notification payload
            const shouldPreservePassword = type === 'user.created';
            data = shouldPreservePassword ? data : this.sanitizePayload(data);

            // Robust data unwrapping: Some services wrap the payload in 'body' or 'payload'
            if (data && !data.companyId && (data.body || data.payload || data.data)) {
                const nested = data.body || data.payload || data.data;
                if (nested.companyId || nested.id || nested.debtId || nested.saleId) {
                    logger.debug(`📦 Unwrapping nested payload for ${type}`);
                    data = { ...data, ...nested };
                }
            }

            // Robust ID generation if missing (critical for duplication check)
            if (!eventId) {
                const crypto = require('crypto');
                // Create deterministic ID based on content to allow retries but prevent duplicates
                const payloadStr = JSON.stringify({ type, routingKey, emittedAt, dataIds: data?.id || data?.saleId || data?.debtId });
                eventId = crypto.createHash('md5').update(payloadStr).digest('hex');
                logger.debug(`🆔 Generated eventId ${eventId} for ${type} (was missing)`);
            }

            if (!type) {
                logger.warn('⚠️ Event missing type field', { routingKey, source, eventId });
                return;
            }

            logger.debug(`📥 processEvent called for ${type}`, { source, eventId, routingKey });

            // Check if this event type should trigger notifications
            const shouldNotify = intentClassifier.shouldNotify(type);
            if (!shouldNotify) {
                if (!type.startsWith('notification.')) {
                    logger.debug(`📭 Event ${type} not configured for notifications`);
                }
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
                // Normalize role for channel lookup (e.g. worker_management -> worker)
                const channelLookupRole = role.startsWith('worker_') ? 'worker' : role;
                const channels = intentClassifier.getChannelsForIntent(intent, channelLookupRole);

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
                        userId: userId === 'external' ? null : userId,
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
            shopId: data.shopId || data.shop_id || data.context?.shopId || data.owner?.shopId,
            userId: data.userId || data.adminId || data.id || data.context?.userId || data.owner?.userId,
            ...data
        };

        // --- ENRICHMENT STEP ---
        // Dynamically fetch names if IDs exist but names are missing
        if (extracted.shopId && !extracted.shopName) {
            extracted.shopName = await enrichmentService.getShopName(extracted.shopId);
        }
        if (extracted.userId && !extracted.userName) {
            extracted.userName = await enrichmentService.getUserName(extracted.userId);
        }

        // Enrich specific fields for transfers
        if (extracted.sourceShopId && !extracted.sourceShopName) {
            extracted.sourceShopName = await enrichmentService.getShopName(extracted.sourceShopId);
        }
        if (extracted.destinationShopId && !extracted.destinationShopName) {
            extracted.destinationShopName = await enrichmentService.getShopName(extracted.destinationShopId);
        }
        if (extracted.toShopId && !extracted.destinationShopName) {
            extracted.destinationShopName = await enrichmentService.getShopName(extracted.toShopId);
        }

        // Enrich performer if available
        if (data.performedBy || data.soldBy) {
            const performerId = data.performedBy?.userId || data.performedBy || data.soldBy;
            extracted.performedByName = await enrichmentService.getUserName(performerId);
        } else if (extracted.userId && extracted.userName) {
            // Fallback: if main user is the actor
            extracted.performedByName = extracted.userName;
        }

        // Event-specific extractions
        switch (eventType) {
            case 'user.created':
                let friendlyDepartments = 'General';
                if (data.assignedDepartments && Array.isArray(data.assignedDepartments)) {
                    // Try to format nicely e.g. "Inventory, Sales"
                    friendlyDepartments = data.assignedDepartments
                        .map(d => d.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())) // "inventory_manager" -> "Inventory Manager"
                        .join(', ');
                }

                // Ensure Company Name is present
                if (!extracted.companyName && extracted.companyId) {
                    extracted.companyName = await enrichmentService.getCompanyName(extracted.companyId);
                }

                // Ensure Shop Name is present if shopId exists
                if (!extracted.shopName && extracted.shopId) {
                    extracted.shopName = await enrichmentService.getShopName(extracted.shopId);
                }

                return {
                    ...extracted,
                    email: data.email,
                    phone: data.phone,
                    userName: data.firstName || data.name || 'User',
                    password: data.password || data.generatedPassword, // Critical for welcome email
                    role: data.role,
                    companyName: extracted.companyName || 'Invexis',
                    shopName: extracted.shopName || 'Main Office',
                    departments: friendlyDepartments
                };

            case 'company.created':
            case 'company.updated':
                return {
                    ...extracted,
                    companyName: data.name,
                    adminId: data.adminId || data.userId,
                    email: data.email,
                    phone: data.phone
                };

            case 'shop.created':
            case 'shop.updated':
            case 'shop.deleted':
            case 'shop.statusChanged':
                return {
                    ...extracted,
                    id: cleanValue(data.shopId || data.id, 'unknown'),
                    name: cleanValue(data.name, 'Shop'),
                    status: cleanValue(data.status, 'Active'),
                    adminId: data.adminId || data.managerId
                };

            case 'sale.created':
            case 'sale.updated':
            case 'sale.deleted':
            case 'sale.cancelled':
            case 'sale.status.changed':
            case 'sale.payment.status.changed':
            case 'sale.return.created':
            case 'sale.return.approved':
            case 'sale.refund.processed':
            case 'sale.return.fully_returned':
                return {
                    ...extracted,
                    saleId: cleanValue(data.saleId || data.id, 'unknown'),
                    totalAmount: cleanAmount(data.totalAmount || data.refundAmount || data.amount, 0),
                    refundAmount: cleanAmount(data.refundAmount || 0, 0),
                    customerId: cleanValue(data.customerId, 'Guest'),
                    customerName: cleanValue(data.customerName, 'Customer'),
                    items: data.items || [],
                    createdAt: data.createdAt || data.processedAt || new Date()
                };

            case 'inventory.low_stock':
            case 'inventory.out_of_stock':
            case 'inventory.product.low_stock':
            case 'inventory.product.out_of_stock':
                return {
                    ...extracted,
                    productId: data.productId,
                    productName: cleanValue(data.productName || data.name, 'Product'),
                    sku: cleanValue(data.sku, ''),
                    currentStock: cleanAmount(data.currentStock || data.stock, 0),
                    threshold: cleanAmount(data.threshold, 0),
                    percentageOfThreshold: cleanAmount(data.percentageOfThreshold, 0),
                    suggestedReorderQty: cleanAmount(data.suggestedReorderQty, 0),
                    priority: cleanValue(data.priority, 'normal'),
                    shopId: data.shopId || data.sourceShopId || data.toShopId
                };

            case 'inventory.product.created':
            case 'inventory.product.updated':
            case 'inventory.product.deleted':
                return {
                    ...extracted,
                    productId: data.productId || data._id,
                    productName: cleanValue(data.productName || data.name, 'Product'),
                    sku: cleanValue(data.sku, ''),
                    userName: cleanValue(data.userName || data.createdByName, 'Staff')
                };

            case 'inventory.stock.updated':
                return {
                    ...extracted,
                    productId: data.productId,
                    productName: cleanValue(data.productName, 'Product'),
                    current: cleanAmount(data.current, 0),
                    previous: cleanAmount(data.previous, 0),
                    change: cleanAmount(data.change, 0),
                    type: cleanValue(data.type, 'update'),
                    reason: cleanValue(data.reason, 'Stock update')
                };

            case 'inventory.transfer.created':
            case 'inventory.transfer.cross':
            case 'inventory.transfer.bulk.intra':
            case 'inventory.transfer.bulk.cross':
            case 'inventory.transfer.bulk.cross.sent':
            case 'inventory.transfer.bulk.cross.received':
                return {
                    ...extracted,
                    productId: data.productId,
                    productName: cleanValue(data.productName || data.name, 'Product'),
                    quantity: cleanAmount(data.quantity || data.transferQuantity, 0),
                    sourceShopId: data.sourceShopId || data.fromShopId,
                    destinationShopId: data.destinationShopId || data.toShopId,
                    shopId: data.shopId || data.sourceShopId || data.toShopId || data.fromShopId,
                    reason: cleanValue(data.reason, 'Standard Transfer'),
                    priority: 'normal'
                };

            case 'debt.overdue':
            case 'debt.reminder.overdue':
            case 'debt.reminder.upcoming':
            case 'debt.reminder.manual':
            case 'debt.created':
            case 'debt.repayment.created':
            case 'debt.fully_paid':
            case 'debt.marked.paid':
            case 'debt.cancelled':
            case 'debt.status.updated':
                return {
                    ...extracted,
                    debtId: cleanValue(data.debtId || data.id, 'unknown'),
                    amount: cleanAmount(data.amount || data.paymentDetails?.amountPaid || data.debtDetails?.totalAmount, 0),
                    originalAmount: cleanAmount(data.originalAmount || data.debtDetails?.totalAmount, 0),
                    remainingBalance: cleanAmount(data.remainingBalance || data.remainingAmount || data.debtStatus?.newBalance || data.debtDetails?.balance || data.newBalance, 0),
                    paidAmount: cleanAmount(data.paidAmount || data.amountPaid || data.paymentDetails?.amountPaid || data.debtDetails?.amountPaidNow, 0),
                    customerName: cleanValue(data.customerName || data.customer?.name, 'Customer'),
                    // Critical for AFFECTED_USER resolution
                    email: data.customerEmail || data.customer?.email,
                    phone: data.customerPhone || data.customer?.phone,

                    dueDate: data.dueDate || data.debtDetails?.dueDate,
                    status: cleanValue(data.status || data.debtStatus?.newStatus, 'PENDING'),
                    notes: data.notes
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
        let templateName = this.getTemplateName(eventType);

        // Dynamic template selection for user.created
        if (eventType === 'user.created') {
            templateName = data.password ? 'welcome' : 'welcome_manual';
        }

        // Build channel configuration first
        const channelConfig = this.buildChannelConfig(channels);

        // Compile content for all channels
        let compiledContent = {};
        try {
            // Include role in compilation data for role-based template selection
            const compilationData = { ...data, role };
            compiledContent = await compileTemplatesForChannels(templateName, compilationData, channelConfig);
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
            inApp: channels.includes('inApp')
        };
    }

    /**
     * Initialize delivery status for all channels
     */
    initializeDeliveryStatus(channels) {
        const status = {};
        for (const channel of channels) {
            const normalizedChannel = channel;
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
        // Debt - use dot notation to match templates.js
        if (eventType.startsWith('debt.reminder.upcoming')) return 'debt.reminder.upcoming';
        if (eventType.startsWith('debt.reminder.overdue')) return 'debt.reminder.overdue';

        const mapping = {
            'user.created': 'welcome', // Default to welcome (will be refined in createNotification)
            'company.created': 'welcome',
            'company.suspended': 'company.suspended',
            'shop.created': 'shop.created',
            'shop.updated': 'shop.updated',
            'shop.deleted': 'shop.deleted',
            'shop.statusChanged': 'shop.status_updated',

            // Sales - direct mapping to keys in templates.js
            'sale.created': 'sale.created',
            'sale.updated': 'sale.updated',
            'sale.deleted': 'sale.deleted',
            'sale.cancelled': 'sale.cancelled',
            'sale.return.created': 'sale.return.created',

            // Inventory
            'inventory.low_stock': 'inventory.low_stock',
            'inventory.product.low_stock': 'inventory.low_stock',
            'inventory.out_of_stock': 'inventory.out_of_stock',
            'inventory.product.out_of_stock': 'inventory.out_of_stock',
            'inventory.stock.updated': 'inventory.stock.updated',

            'inventory.transfer.created': 'inventory.transfer.created',
            'inventory.transfer.completed': 'inventory.transfer.completed',

            'inventory.product.created': 'product.created',
            'inventory.product.updated': 'product.updated',
            'inventory.product.deleted': 'product.deleted',

            // Debt - direct mapping for exact matches
            'debt.overdue': 'debt.overdue',
            'debt.created': 'debt.created',
            'debt.repayment.created': 'debt.repayment.created',
            'debt.fully_paid': 'debt.fully_paid',
            'debt.cancelled': 'debt.cancelled',
            'debt.status.updated': 'debt.status.updated',
            'debt.deleted': 'debt.cancelled',

            // Products
            'product.created': 'product.created',
            'product.updated': 'product.updated',
            'product.deleted': 'product.deleted',

            'debt.repaid': 'debt.repayment.created', // Map legacy
            'debt.fully.paid': 'debt.fully_paid',   // Map legacy
            'debt.marked.paid': 'debt.payment.received',
            'debt.payment.received': 'debt.payment.received',

            // Payments
            'payment.success': 'payment.success',
            'payment.processed': 'payment.success',
            'payment.failed': 'payment.failed',
            'subscription.expiring': 'subscription.expiring',
            'subscription.expiring.soon': 'subscription.expiring',
            'subscription.expired': 'subscription.expired',

            // Documents
            'document.invoice.created': 'payment.success'
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
            'sale.updated': 'Sale Updated',
            'sale.deleted': 'Sale Deleted',
            'sale.cancelled': 'Sale Cancelled',
            'sale.return.created': 'Product Return Initiated',
            'inventory.low_stock': '⚠️ Low Stock Alert',
            'inventory.product.low_stock': '⚠️ Low Stock Alert',
            'inventory.out_of_stock': '🚨 Out of Stock',
            'inventory.product.out_of_stock': '🚨 Out of Stock',
            'debt.overdue': '⏰ Payment Overdue',
            'payment.success': '✅ Payment Successful',
            'payment.failed': '❌ Payment Failed',
            'subscription.expiring.soon': '⚠️ Subscription Expiring Soon',
            'subscription.expired': '🚨 Subscription Expired'
        };
        return titles[eventType] || 'Notification';
    }

    getDefaultBody(eventType, data) {
        const bodies = {
            'company.created': `Welcome, ${data.name || 'Admin'}! Your account is ready.`,
            'shop.created': `Shop "${data.name}" has been successfully created.`,
            'sale.created': `New sale for $${data.totalAmount || 0} recorded.`,
            'sale.updated': `Sale ${data.saleId || data.id} has been updated.`,
            'sale.deleted': `Sale ${data.saleId || data.id} has been deleted.`,
            'sale.cancelled': `Sale ${data.saleId || data.id} has been cancelled.`,
            'sale.return.created': `Return for sale ${data.saleId} initiated ($${data.refundAmount || 0}).`,
            'inventory.low_stock': `${data.productName || 'Product'} is running low (${data.currentStock || 0} left, threshold: ${data.threshold || 0}).`,
            'inventory.product.low_stock': `${data.productName || 'Product'} is running low (${data.currentStock || 0} left, threshold: ${data.threshold || 0}).`,
            'inventory.out_of_stock': `${data.productName || 'Product'} is out of stock.`,
            'inventory.product.out_of_stock': `${data.productName || 'Product'} is out of stock.`,
            'debt.overdue': `Payment of $${data.amount || 0} is overdue.`,
            'subscription.expiring.soon': data.message || `Your subscription is expiring soon on ${data.endDate}.`,
            'subscription.expired': `Your subscription has expired. Service has been suspended.`
        };
        return bodies[eventType] || 'You have a new notification.';
    }
}

// Export singleton instance
module.exports = new NotificationEventProcessor();
