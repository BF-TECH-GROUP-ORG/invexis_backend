const mongoose = require('mongoose');
const { Schema } = mongoose;
const { v4: uuidv4 } = require('uuid');

/**
 * Outbox Model - Implements Transactional Outbox Pattern
 * Ensures reliable event publishing even if RabbitMQ is temporarily unavailable
 * Events are created within same transaction as business logic
 */
const outboxSchema = new Schema(
  {
    _id: { type: String, default: () => uuidv4() },
    type: {
      type: String,
      required: true,
      index: true,
      enum: [
        // Notification events
        'notification.sent',
        'notification.delivered',
        'notification.failed',
        'notification.read',
        // Email events
        'notification.email.sent',
        'notification.email.delivered',
        'notification.email.bounced',
        'notification.email.failed',
        // SMS events
        'notification.sms.sent',
        'notification.sms.delivered',
        'notification.sms.failed',
        // Push events
        'notification.push.sent',
        'notification.push.delivered',
        'notification.push.failed',
        // In-app events
        'notification.inapp.sent',
        'notification.inapp.read',
        // OTP events
        'notification.otp.sent',
        'notification.otp.verified',
        'notification.otp.expired',
        // Preference events
        'notification.preference.updated',
        // Template events
        'notification.template.created',
        'notification.template.updated'
      ]
    },
    exchange: {
      type: String,
      required: true,
      default: 'events_topic'
    },
    routingKey: {
      type: String,
      required: true,
      index: true
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'sent', 'failed'],
      default: 'pending',
      index: true
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0
    },
    lastError: {
      type: String,
      default: null
    },
    processedAt: {
      type: Date,
      default: null
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

// Compound index for efficient querying
outboxSchema.index({ status: 1, createdAt: 1 });
outboxSchema.index({ type: 1, status: 1 });

/**
 * Create a new outbox event
 */
outboxSchema.statics.create = async function (data, session = null) {
  const outbox = new this(data);
  if (session) {
    await outbox.save({ session });
  } else {
    await outbox.save();
  }
  return outbox;
};

/**
 * Find pending events for processing
 */
outboxSchema.statics.findPending = async function (limit = 50) {
  return await this.find({ status: 'pending' })
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean();
};

/**
 * Mark event as processing
 */
outboxSchema.statics.markAsProcessing = async function (id) {
  return await this.findByIdAndUpdate(
    id,
    {
      status: 'processing',
      updatedAt: new Date()
    },
    { new: true }
  );
};

/**
 * Mark event as sent
 */
outboxSchema.statics.markAsSent = async function (id) {
  return await this.findByIdAndUpdate(
    id,
    {
      status: 'sent',
      processedAt: new Date(),
      updatedAt: new Date()
    },
    { new: true }
  );
};

/**
 * Mark event as failed
 */
outboxSchema.statics.markAsFailed = async function (id, error) {
  return await this.findByIdAndUpdate(
    id,
    {
      status: 'failed',
      lastError: error?.message || String(error),
      $inc: { attempts: 1 },
      updatedAt: new Date()
    },
    { new: true }
  );
};

/**
 * Reset stale processing events (older than threshold)
 */
outboxSchema.statics.resetStaleProcessing = async function (hoursThreshold = 0.2) {
  const threshold = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000);
  return await this.updateMany(
    {
      status: 'processing',
      updatedAt: { $lt: threshold }
    },
    {
      status: 'pending',
      updatedAt: new Date()
    }
  );
};

/**
 * Find events by status
 */
outboxSchema.statics.findByStatus = async function (status, limit = 50) {
  return await this.find({ status })
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean();
};

/**
 * Count events by status
 */
outboxSchema.statics.countByStatus = async function (status) {
  return await this.countDocuments({ status });
};

/**
 * Delete old sent events (cleanup)
 */
outboxSchema.statics.deleteOldSentEvents = async function (daysOld = 30) {
  const threshold = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  return await this.deleteMany({
    status: 'sent',
    processedAt: { $lt: threshold }
  });
};

/**
 * OutboxService - Helper methods for dispatcher
 */
const OutboxService = {
  async fetchBatch(limit = 50) {
    return await Outbox.findPending(limit);
  },

  async markAsSent(id) {
    return await Outbox.markAsSent(id);
  },

  async markAsFailed(id, error) {
    return await Outbox.markAsFailed(id, error);
  },

  async resetStale(hoursThreshold = 0.2) {
    return await Outbox.resetStaleProcessing(hoursThreshold);
  }
};

const Outbox = mongoose.model('Outbox', outboxSchema);

// Attach service methods
Outbox.OutboxService = OutboxService;

module.exports = Outbox;

