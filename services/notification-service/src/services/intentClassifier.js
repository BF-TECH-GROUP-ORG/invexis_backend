/**
 * Intent-Based Notification Classifier
 * 
 * Classifies events into intents and derives appropriate channels
 * based on recipient role and notification intent
 */

const { NOTIFICATION_INTENTS, AUTH_ROLES, INTENT_DISPLAY_NAMES } = require('../constants/roles');
const logger = require('../utils/logger');

class IntentClassifier {
    constructor() {
        // Map event types to intents
        this.intentMap = {
            // Operational - day-to-day execution
            'shop.created': NOTIFICATION_INTENTS.OPERATIONAL,
            'shop.updated': NOTIFICATION_INTENTS.OPERATIONAL,
            'shop.statusChanged': NOTIFICATION_INTENTS.OPERATIONAL,
            'product.created': NOTIFICATION_INTENTS.OPERATIONAL,
            'product.updated': NOTIFICATION_INTENTS.OPERATIONAL,
            'sale.created': NOTIFICATION_INTENTS.OPERATIONAL,
            'sale.completed': NOTIFICATION_INTENTS.OPERATIONAL,
            'inventory.low_stock': NOTIFICATION_INTENTS.OPERATIONAL,

            // Financial - money, payments, debt
            'payment.success': NOTIFICATION_INTENTS.FINANCIAL,
            'payment.refunded': NOTIFICATION_INTENTS.FINANCIAL,
            'sale.refunded': NOTIFICATION_INTENTS.FINANCIAL,
            'sale.return.created': NOTIFICATION_INTENTS.FINANCIAL,
            'debt.created': NOTIFICATION_INTENTS.FINANCIAL,
            'debt.fully_paid': NOTIFICATION_INTENTS.FINANCIAL,
            'debt.repayment.created': NOTIFICATION_INTENTS.FINANCIAL,
            'subscription.expiring': NOTIFICATION_INTENTS.FINANCIAL,

            // Risk/Security - suspension, failure, anomalies
            'company.suspended': NOTIFICATION_INTENTS.RISK_SECURITY,
            'company.allSuspended': NOTIFICATION_INTENTS.RISK_SECURITY,
            'user.suspended': NOTIFICATION_INTENTS.RISK_SECURITY,
            'payment.failed': NOTIFICATION_INTENTS.RISK_SECURITY,
            'inventory.out_of_stock': NOTIFICATION_INTENTS.RISK_SECURITY,
            'sale.cancelled': NOTIFICATION_INTENTS.RISK_SECURITY,
            'debt.overdue': NOTIFICATION_INTENTS.RISK_SECURITY,
            'debt.reminder.overdue': NOTIFICATION_INTENTS.RISK_SECURITY,
            'subscription.expired': NOTIFICATION_INTENTS.RISK_SECURITY,

            // Accountability - specific user must act
            'company.created': NOTIFICATION_INTENTS.ACCOUNTABILITY,
            'user.created': NOTIFICATION_INTENTS.ACCOUNTABILITY,
            'user.password.reset': NOTIFICATION_INTENTS.ACCOUNTABILITY,
            'company.status.changed': NOTIFICATION_INTENTS.ACCOUNTABILITY,
            'company.tierChanged': NOTIFICATION_INTENTS.ACCOUNTABILITY,

            // Strategic/Insight - trends, forecasts (future)
            // 'analytics.weeklyReport': NOTIFICATION_INTENTS.STRATEGIC_INSIGHT,
        };

        // Channel matrix: Intent → Role → Channels
        this.channelMatrix = {
            [NOTIFICATION_INTENTS.OPERATIONAL]: {
                [AUTH_ROLES.COMPANY_ADMIN]: ['in-app'],
                [AUTH_ROLES.WORKER]: ['in-app'],
                [AUTH_ROLES.SUPER_ADMIN]: ['in-app']
            },

            [NOTIFICATION_INTENTS.FINANCIAL]: {
                [AUTH_ROLES.COMPANY_ADMIN]: ['email', 'in-app'],
                [AUTH_ROLES.WORKER]: ['in-app'],
                [AUTH_ROLES.SUPER_ADMIN]: ['email', 'in-app']
            },

            [NOTIFICATION_INTENTS.RISK_SECURITY]: {
                [AUTH_ROLES.COMPANY_ADMIN]: ['email', 'in-app', 'sms'],
                [AUTH_ROLES.WORKER]: ['email', 'in-app'],
                [AUTH_ROLES.SUPER_ADMIN]: ['email', 'in-app'],
                [AUTH_ROLES.CUSTOMER]: ['email', 'in-app']
            },

            [NOTIFICATION_INTENTS.ACCOUNTABILITY]: {
                [AUTH_ROLES.COMPANY_ADMIN]: ['email', 'in-app'],
                [AUTH_ROLES.WORKER]: ['in-app'],
                [AUTH_ROLES.SUPER_ADMIN]: ['email', 'in-app'],
                [AUTH_ROLES.CUSTOMER]: ['email', 'in-app']
            },

            [NOTIFICATION_INTENTS.STRATEGIC_INSIGHT]: {
                [AUTH_ROLES.COMPANY_ADMIN]: ['email', 'in-app'],
                [AUTH_ROLES.SUPER_ADMIN]: ['in-app']
            }
        };
    }

    /**
     * Classify event into an intent
     * @param {string} eventType - Event type (e.g., 'shop.created')
     * @returns {string} - Intent classification
     */
    classify(eventType) {
        const intent = this.intentMap[eventType] || NOTIFICATION_INTENTS.OPERATIONAL;

        logger.debug(`📊 Classified event ${eventType} as ${INTENT_DISPLAY_NAMES[intent]}`);

        return intent;
    }

    /**
     * Get appropriate channels for a given intent and role
     * @param {string} intent - Notification intent
     * @param {string} role - User role from auth service
     * @returns {string[]} - Array of channel names
     */
    getChannelsForIntent(intent, role) {
        const channels = this.channelMatrix[intent]?.[role] || ['in-app'];

        logger.debug(`📡 Channels for ${INTENT_DISPLAY_NAMES[intent]} + ${role}: ${channels.join(', ')}`);

        return channels;
    }

    /**
     * Get all intents mapped to an event (for multi-intent events)
     * @param {string} eventType - Event type
     * @returns {string[]} - Array of intents
     */
    getAllIntents(eventType) {
        // For now, single intent per event
        // Future: Support multiple intents (e.g., payment.failed = FINANCIAL + RISK)
        return [this.classify(eventType)];
    }

    /**
     * Check if an event should trigger notifications
     * @param {string} eventType - Event type
     * @returns {boolean}
     */
    shouldNotify(eventType) {
        return this.intentMap.hasOwnProperty(eventType);
    }
}

module.exports = new IntentClassifier();
