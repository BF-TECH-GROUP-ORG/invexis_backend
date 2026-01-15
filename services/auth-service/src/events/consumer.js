const User = require('../models/User.models');

let rabbitmq;
try {
    rabbitmq = require('/app/shared/rabbitmq.js');
} catch (error) {
    try {
        rabbitmq = require('/app/shared/rabbitmq.js');
    } catch (err) {
        console.warn('RabbitMQ shared lib not found, consumer will not start');
        rabbitmq = null;
    }
}

const handleCompanyCreated = async (content, routingKey) => {
    try {
        const payload = content.data || content;
        const targetUserId = payload.companyAdminId || payload.adminId;
        const newCompanyId = payload.companyId;

        console.log(`[Sync DEBUG] Received ${routingKey} event. Payload:`, JSON.stringify(payload, null, 2));

        if (!targetUserId || !newCompanyId) {
            console.error(`[Sync ERROR] Invalid payload: missing adminId or companyId. targetUserId: ${targetUserId}, newCompanyId: ${newCompanyId}`);
            return;
        }

        console.log(`[Sync] Updating user ${targetUserId} with company ${newCompanyId}`);

        // Use findByIdAndUpdate with $addToSet for atomicity and to bypass unnecessary pre-save validation
        // which might fail if the user profile is incomplete (e.g. missing nationalId)
        const updatedUser = await User.findByIdAndUpdate(
            targetUserId,
            { $addToSet: { companies: newCompanyId.toString() } },
            { new: true, runValidators: false } // runValidators: false skips schema-level validation on update
        );

        if (!updatedUser) {
            console.error(`User not found for update: ${targetUserId}`);
            return;
        }

        console.log(`✅ [Sync Success] User ${updatedUser.username} updated. Companies:`, updatedUser.companies);

    } catch (error) {
        console.error('Error handling company.created event:', error);
        throw error;
    }
};

/**
 * Handle user removed from company (all departments)
 * Syncs with company-service deletion
 */
const handleUserRemovedFromCompany = async (content, routingKey) => {
    try {
        const payload = content.data || content;
        const { userId, companyId } = payload;

        console.log(`Received department_user.removed_from_company event: userId=${userId}, companyId=${companyId}`);

        if (!userId || !companyId) {
            console.error('Invalid payload: missing userId or companyId');
            return;
        }

        // Use $pull to remove item from array atomically
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $pull: { companies: companyId.toString() } },
            { new: true, runValidators: false }
        );

        if (!updatedUser) {
            console.error(`User not found: ${userId}`);
            return;
        }

        console.log(`✅ Removed set for user ${updatedUser.username} (${userId}) from company ${companyId}. Companies now:`, updatedUser.companies);

        // Invalidate user cache in Redis
        try {
            const redis = require('/app/shared/redis'); // Fixed path just in case
            if (redis && redis.del) {
                await redis.del(`user:${userId}`);
            }
        } catch (e) {
            console.warn('Redis invalidation failed in handleUserRemovedFromCompany');
        }

    } catch (error) {
        console.error('Error handling department_user.removed_from_company event:', error);
        throw error;
    }
};

/**
 * Handle user removed from specific department
 * (Optional: can use this for granular sync if needed)
 */
const handleUserRemovedFromDepartment = async (content, routingKey) => {
    try {
        const payload = content.data || content;
        const { userId, departmentId, companyId } = payload;

        console.log(`Received department_user.removed event: userId=${userId}, departmentId=${departmentId}, companyId=${companyId}`);

        // Note: At auth-service level, we track companies not departments
        // Department removal at company-service already handles the deletion
        // This event can be logged/audited if needed

    } catch (error) {
        console.error('Error handling department_user.removed event:', error);
        throw error;
    }
};

const handleShopCreated = async (content, routingKey) => {
    try {
        const payload = content.data || content;
        const targetUserId = payload.userId || payload.createdBy;
        const newShopId = payload.shopId;

        console.log(`[Sync DEBUG] Received ${routingKey} event. Payload:`, JSON.stringify(payload, null, 2));

        if (!targetUserId || !newShopId) {
            console.error(`[Sync ERROR] Invalid payload: missing userId or shopId. targetUserId: ${targetUserId}, newShopId: ${newShopId}`);
            return;
        }

        console.log(`[Sync] Updating user ${targetUserId} with shop ${newShopId}`);

        const updatedUser = await User.findByIdAndUpdate(
            targetUserId,
            { $addToSet: { shops: newShopId.toString() } },
            { new: true, runValidators: false }
        );

        if (!updatedUser) {
            console.error(`User not found for shop update: ${targetUserId}`);
            return;
        }

        console.log(`✅ [Sync Success] User ${updatedUser.username} updated. Shops:`, updatedUser.shops);

    } catch (error) {
        console.error('Error handling shop.created event:', error);
        throw error;
    }
};

const startConsumers = async () => {
    if (!rabbitmq) return;

    try {
        // Consumer 1: Company sync (Created or Updated)
        const companySyncConfig = {
            queue: 'auth_service_company_sync',
            exchange: 'events_topic',
            routingPattern: 'company.*' // Listen to company.created, company.updated
        };
        // Note: Specific handlers filter for the patterns they need, but for simplicity we can use the same
        await rabbitmq.subscribe({
            queue: 'auth_service_company_sync',
            exchange: 'events_topic',
            pattern: 'company.#' // Matches company.created, company.updated, etc.
        }, (content, routingKey) => {
            if (routingKey === 'company.created' || routingKey === 'company.updated') {
                return handleCompanyCreated(content, routingKey);
            }
        });
        console.log('✓ Auth Service consumer started: listening for company sync (created/updated)');

        // Consumer 2: User removed from company
        const userRemovedFromCompanyConfig = {
            queue: 'auth_service_user_removed_from_company',
            exchange: 'events_topic',
            pattern: 'department_user.removed_from_company'
        };
        await rabbitmq.subscribe(userRemovedFromCompanyConfig, handleUserRemovedFromCompany);
        console.log('✓ Auth Service consumer started: listening for department_user.removed_from_company');

        // Consumer 3: Shop sync (Created or Updated)
        await rabbitmq.subscribe({
            queue: 'auth_service_shop_sync',
            exchange: 'events_topic',
            pattern: 'shop.#' // Matches shop.created, shop.updated, etc.
        }, (content, routingKey) => {
            if (routingKey === 'shop.created' || routingKey === 'shop.updated') {
                return handleShopCreated(content, routingKey);
            }
        });
        console.log('✓ Auth Service consumer started: listening for shop sync (created/updated)');

        // Consumer 4: User removed from department (optional logging)
        const userRemovedFromDepartmentConfig = {
            queue: 'auth_service_user_removed_from_department',
            exchange: 'events_topic',
            pattern: 'department_user.removed'
        };
        await rabbitmq.subscribe(userRemovedFromDepartmentConfig, handleUserRemovedFromDepartment);
        console.log('✓ Auth Service consumer started: listening for department_user.removed');

    } catch (error) {
        console.error('Failed to start Auth Service consumers:', error);
    }
};

module.exports = { startConsumers };
