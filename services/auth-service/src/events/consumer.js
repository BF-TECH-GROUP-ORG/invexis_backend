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
        const payload = content.data || content; // Handle wrapped or unwrapped
        console.log(`Received company.created event for admin: ${payload.adminId || payload.companyAdminId}`);

        // Prefer companyAdminId (explicit), fallback to adminId (createdBy)
        const targetUserId = payload.companyAdminId || payload.adminId;
        const newCompanyId = payload.companyId;

        if (!targetUserId || !newCompanyId) {
            console.error('Invalid payload: missing adminId or companyId');
            return;
        }

        const user = await User.findById(targetUserId);
        if (!user) {
            console.error(`User not found for update: ${targetUserId}`);
            return;
        }

        // Add company ID if not present
        if (!user.companies.includes(newCompanyId)) {
            user.companies.push(newCompanyId);
            await user.save();
            console.log(`Updated user ${user.username} (${user.id}) with new company ${newCompanyId}`);
        } else {
            console.log(`User ${user.username} already has company ${newCompanyId}`);
        }

    } catch (error) {
        console.error('Error handling company.created event:', error);
        // Throwing error will trigger RabbitMQ retry logic if configured
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

        const user = await User.findById(userId);
        if (!user) {
            console.error(`User not found: ${userId}`);
            return;
        }

        // Remove company from user's companies array
        if (user.companies && user.companies.includes(companyId)) {
            user.companies = user.companies.filter(c => c.toString() !== companyId.toString());
            await user.save();
            console.log(`Removed user ${user.username} (${userId}) from company ${companyId}`);
        } else {
            console.log(`User ${user.username} (${userId}) not associated with company ${companyId}`);
        }

        // Invalidate user cache in Redis
        const redis = require('../lib/redis');
        redis.del(`user:${userId}`);

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

const startConsumers = async () => {
    if (!rabbitmq) return;

    try {
        // Consumer 1: Company created
        const companyCreatedConfig = {
            queue: 'auth_service_company_created',
            exchange: 'events_topic',
            pattern: 'company.created'
        };
        await rabbitmq.subscribe(companyCreatedConfig, handleCompanyCreated);
        console.log('✓ Auth Service consumer started: listening for company.created');

        // Consumer 2: User removed from company (all departments)
        const userRemovedFromCompanyConfig = {
            queue: 'auth_service_user_removed_from_company',
            exchange: 'events_topic',
            pattern: 'department_user.removed_from_company'
        };
        await rabbitmq.subscribe(userRemovedFromCompanyConfig, handleUserRemovedFromCompany);
        console.log('✓ Auth Service consumer started: listening for department_user.removed_from_company');

        // Consumer 3: User removed from department (optional logging)
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
