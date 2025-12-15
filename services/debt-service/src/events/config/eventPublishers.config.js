/**
 * Event Publishers Configuration - Debt Service
 * Defines all events that debt-service publishes
 * Used by producer.js to initialize publishers
 */

module.exports = {
  // Debt Events
  'debt.created': {
    exchange: 'events_topic',
    routingKey: 'debt.created',
    description: 'Published when a new debt record is created'
  },
  'debt.updated': {
    exchange: 'events_topic',
    routingKey: 'debt.updated',
    description: 'Published when a debt record is updated'
  },
  'debt.payment.made': {
    exchange: 'events_topic',
    routingKey: 'debt.payment.made',
    description: 'Published when a payment is made against a debt'
  },
  'debt.payment.failed': {
    exchange: 'events_topic',
    routingKey: 'debt.payment.failed',
    description: 'Published when a payment attempt fails'
  },
  'debt.settlement.completed': {
    exchange: 'events_topic',
    routingKey: 'debt.settlement.completed',
    description: 'Published when a debt is fully settled'
  },
  'debt.overdue': {
    exchange: 'events_topic',
    routingKey: 'debt.overdue',
    description: 'Published when a debt becomes overdue'
  },
  'debt.reminder.sent': {
    exchange: 'events_topic',
    routingKey: 'debt.reminder.sent',
    description: 'Published when a payment reminder is sent'
  },
  'debt.cancelled': {
    exchange: 'events_topic',
    routingKey: 'debt.cancelled',
    description: 'Published when a debt is cancelled'
  }
};
