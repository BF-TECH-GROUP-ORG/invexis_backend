/**
 * Auth Service Event Producer
 * Publishes authentication and user lifecycle events
 */

const { publish, exchanges } = require('/app/shared/rabbitmq');

/**
 * Publish user-related events
 */
const publishUserEvent = {
    /**
     * User created event
     * @param {Object} user - The created user object
     * @param {String} [password] - The auto-generated password (optional)
     */
    async created(user, password) {
        try {
            const eventData = {
                type: 'user.created',
                data: {
                    userId: user._id.toString(),
                    email: user.email,
                    phone: user.phone,
                    fcmToken: user.fcmToken,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    role: user.role,
                    companies: user.companies || [],
                    companyId: user.companies && user.companies.length > 0 ? user.companies[0].toString() : 'system',
                    shops: user.shops || [],
                    createdAt: user.createdAt,
                    password, // Pass plain password if provided (for notification)
                }
            };

            console.log(`🚀 [DEBUG] Publishing user.created to Exchange: ${exchanges.topic}, RoutingKey: auth.user.created`);
            await publish(exchanges.topic, 'auth.user.created', eventData);
            console.log(`✅ [DEBUG] Successfully published user.created event for user ${user._id}`);
        } catch (error) {
            console.error('❌ Failed to publish user.created event:', error.message);
            throw error;
        }
    },

    /**
     * User updated event
     */
    async updated(user, changes) {
        try {
            const eventData = {
                type: 'user.updated',
                data: {
                    userId: user._id.toString(),
                    changes,
                    updatedAt: new Date().toISOString(),
                }
            };

            console.log(`🚀 [DEBUG-AUTH] Preparing to publish user.updated for ${user._id}`);
            console.log(`🚀 [DEBUG-AUTH] Exchange: ${exchanges.topic}, Key: auth.user.updated`);
            await publish(exchanges.topic, 'auth.user.updated', eventData);
            console.log(`✅ [DEBUG-AUTH] Successfully published user.updated event for user ${user._id}`);
        } catch (error) {
            console.error('❌ Failed to publish user.updated event:', error.message);
        }
    },

    /**
     * User deleted event
     */
    async deleted(userId, companyId) {
        try {
            const eventData = {
                type: 'user.deleted',
                data: {
                    userId: userId.toString(),
                    companyId,
                    deletedAt: new Date().toISOString(),
                }
            };

            await publish(exchanges.topic, 'auth.user.deleted', eventData);
            console.log(`✅ Published user.deleted event for user ${userId}`);
        } catch (error) {
            console.error('❌ Failed to publish user.deleted event:', error.message);
        }
    },

    /**
     * User suspended event
     */
    async suspended(userId, companyId, reason) {
        try {
            const eventData = {
                type: 'user.suspended',
                data: {
                    userId: userId.toString(),
                    companyId,
                    reason,
                    suspendedAt: new Date().toISOString(),
                }
            };

            await publish(exchanges.topic, 'auth.user.suspended', eventData);
            console.log(`✅ Published user.suspended event for user ${userId}`);
        } catch (error) {
            console.error('❌ Failed to publish user.suspended event:', error.message);
        }
    },

    /**
     * All users suspended from company event
     */
    async allSuspended(companyId, reason) {
        try {
            const eventData = {
                type: 'user.suspendedAll',
                data: {
                    companyId,
                    reason,
                    suspendedAt: new Date().toISOString(),
                }
            };

            await publish(exchanges.topic, 'auth.user.suspendedAll', eventData);
            console.log(`✅ Published user.suspendedAll event for company ${companyId}`);
        } catch (error) {
            console.error('❌ Failed to publish user.suspendedAll event:', error.message);
        }
    },

    /**
     * User device updated event (for FCM push notifications)
     */
    async deviceUpdated(userId, deviceData) {
        try {
            const eventData = {
                type: 'auth.device.updated',
                data: {
                    userId: userId.toString(),
                    ...deviceData,
                    updatedAt: new Date().toISOString()
                }
            };

            console.log(`🚀 [DEBUG-AUTH] Publishing auth.device.updated for user ${userId}`);
            await publish(exchanges.topic, 'auth.device.updated', eventData);
            console.log(`✅ [DEBUG-AUTH] Successfully published auth.device.updated for user ${userId}`);
        } catch (error) {
            console.error('❌ Failed to publish auth.device.updated event:', error.message);
        }
    },

    /**
     * Security audit event
     */
    async security(action, userId, details = {}) {
        try {
            const eventData = {
                type: `auth.security.${action}`,
                data: {
                    userId: userId ? userId.toString() : 'anonymous',
                    action,
                    ...details,
                    timestamp: new Date().toISOString(),
                }
            };

            await publish(exchanges.topic, `auth.security.${action}`, eventData);
            console.log(`🛡️  Published security event: auth.security.${action}`);
        } catch (error) {
            console.error(`❌ Failed to publish security event [${action}]:`, error.message);
        }
    }
};

module.exports = { publishUserEvent };
