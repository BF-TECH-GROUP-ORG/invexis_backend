/**
 * Auth Service Event Producer
 * Publishes authentication and user lifecycle events
 */

const { emit } = require('/app/shared/rabbitmq');

/**
 * Publish user-related events
 */
const publishUserEvent = {
    /**
     * User created event
     * @param {Object} user - The created user object
     */
    async created(user) {
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
                    shops: user.shops || [],
                    createdAt: user.createdAt,
                }
            };

            await emit('auth.user.created', eventData);
            console.log(`✅ Published user.created event for user ${user._id}`);
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

            await emit('auth.user.updated', eventData);
            console.log(`✅ Published user.updated event for user ${user._id}`);
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

            await emit('auth.user.deleted', eventData);
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

            await emit('auth.user.suspended', eventData);
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

            await emit('auth.user.suspendedAll', eventData);
            console.log(`✅ Published user.suspendedAll event for company ${companyId}`);
        } catch (error) {
            console.error('❌ Failed to publish user.suspendedAll event:', error.message);
        }
    }
};

module.exports = { publishUserEvent };
