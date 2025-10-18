const { getChannel } = require("../config/rabbitmq");

/**
 * Publish events to RabbitMQ
 * @param {string} eventType - Type of event (e.g., 'company.created', 'role.updated')
 * @param {object} data - Event payload
 */
const publishEvent = async (eventType, data) => {
  try {
    const channel = getChannel();
    if (!channel) {
      console.warn("RabbitMQ channel not available, skipping event publish");
      return;
    }

    const event = {
      type: eventType,
      data,
      timestamp: new Date().toISOString(),
      service: "company-service",
    };

    channel.sendToQueue("company_events", Buffer.from(JSON.stringify(event)), {
      persistent: true,
    });

    console.log(`📤 Published event: ${eventType}`, data);
  } catch (error) {
    console.error("Failed to publish event:", error);
  }
};

/**
 * Publish company-related events
 */
const publishCompanyEvent = {
  created: (company) => publishEvent("company.created", company),
  updated: (company) => publishEvent("company.updated", company),
  deleted: (companyId) => publishEvent("company.deleted", { id: companyId }),
  statusChanged: (companyId, status) =>
    publishEvent("company.status.changed", { id: companyId, status }),
  tierChanged: (companyId, tier) =>
    publishEvent("company.tier.changed", { id: companyId, tier }),
};

/**
 * Publish role-related events
 */
const publishRoleEvent = {
  created: (role) => publishEvent("role.created", role),
  updated: (role) => publishEvent("role.updated", role),
  deleted: (roleId) => publishEvent("role.deleted", { id: roleId }),
  permissionAdded: (roleId, permission) =>
    publishEvent("role.permission.added", { id: roleId, permission }),
  permissionRemoved: (roleId, permission) =>
    publishEvent("role.permission.removed", { id: roleId, permission }),
};

/**
 * Publish company-user relationship events
 */
const publishCompanyUserEvent = {
  assigned: (companyUser) => publishEvent("company.user.assigned", companyUser),
  roleChanged: (companyUser) =>
    publishEvent("company.user.role.changed", companyUser),
  suspended: (companyId, userId) =>
    publishEvent("company.user.suspended", { companyId, userId }),
  removed: (companyId, userId) =>
    publishEvent("company.user.removed", { companyId, userId }),
};

/**
 * Publish subscription-related events
 */
const publishSubscriptionEvent = {
  created: (subscription) => publishEvent("subscription.created", subscription),
  updated: (subscription) => publishEvent("subscription.updated", subscription),
  renewed: (subscription) => publishEvent("subscription.renewed", subscription),
  deactivated: (companyId) =>
    publishEvent("subscription.deactivated", { companyId }),
  expiring: (subscription) =>
    publishEvent("subscription.expiring", subscription),
};

module.exports = {
  publishEvent,
  publishCompanyEvent,
  publishRoleEvent,
  publishCompanyUserEvent,
  publishSubscriptionEvent,
};
