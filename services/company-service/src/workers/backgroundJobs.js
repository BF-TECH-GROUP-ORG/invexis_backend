/**
 * Background Job Processor for Company Service
 * Handles async operations that don't need to block the response
 * - File processing
 * - Audit logging
 * - Heavy event publishing
 * - Notifications
 */

const logger = require('../utils/logger');
let rabbitmq;

// Initialize RabbitMQ connection
async function initWorkerQueue() {
  try {
    rabbitmq = require('/app/shared/rabbitmq.js');
    logger.info('✓ Worker queue initialized');
  } catch (err) {
    logger.error('Failed to initialize worker queue:', err);
  }
}

/**
 * Queue a background job for file verification docs
 */
async function queueVerificationDocProcessing(companyId, fileData) {
  if (!rabbitmq) return;
  
  try {
    await rabbitmq.publish({
      exchange: 'jobs_topic',
      routingKey: 'job.company.verify_docs',
      content: {
        type: 'job.company.verify_docs',
        data: {
          companyId,
          fileData,
          timestamp: new Date().toISOString(),
        }
      }
    });
    logger.debug(`Queued doc verification for company ${companyId}`);
  } catch (err) {
    logger.error('Failed to queue doc processing:', err);
  }
}

/**
 * Queue a background job for sending notifications
 */
async function queueNotification(type, data) {
  if (!rabbitmq) return;
  
  try {
    await rabbitmq.publish({
      exchange: 'notifications_topic',
      routingKey: `notification.${type}`,
      content: {
        type: `notification.${type}`,
        data,
        timestamp: new Date().toISOString(),
      }
    });
    logger.debug(`Queued notification: ${type}`);
  } catch (err) {
    logger.error('Failed to queue notification:', err);
  }
}

/**
 * Queue a background job for audit logging
 */
async function queueAuditLog(action, entityType, entityId, userId, changes) {
  if (!rabbitmq) return;
  
  try {
    await rabbitmq.publish({
      exchange: 'audit_topic',
      routingKey: 'audit.log',
      content: {
        type: 'audit.log',
        data: {
          action,
          entityType,
          entityId,
          userId,
          changes,
          timestamp: new Date().toISOString(),
        }
      }
    });
    logger.debug(`Queued audit log: ${action}`);
  } catch (err) {
    logger.error('Failed to queue audit log:', err);
  }
}

module.exports = {
  initWorkerQueue,
  queueVerificationDocProcessing,
  queueNotification,
  queueAuditLog,
};
