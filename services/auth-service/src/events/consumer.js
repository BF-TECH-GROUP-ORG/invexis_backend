const User = require('../models/User.models');

let rabbitmq;
try {
    rabbitmq = require('/app/shared/rabbitmq.js');
} catch (error) {
    try {
        rabbitmq = require('../../../shared/rabbitmq.js');
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

const startConsumers = async () => {
    if (!rabbitmq) return;

    // Queue for Auth Service listening to Company Events
    const queueConfig = {
        queue: 'auth_service_company_created',
        exchange: 'events_topic',
        pattern: 'company.created'
    };

    try {
        await rabbitmq.subscribe(queueConfig, handleCompanyCreated);
        console.log('Auth Service consumer started: listening for company.created');
    } catch (error) {
        console.error('Failed to start Auth Service consumer:', error);
    }
};

module.exports = { startConsumers };
