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
        // Product events
        'inventory.product.created',
        'inventory.product.updated',
        'inventory.product.deleted',
        'inventory.product.price.changed',
        'inventory.product.status.changed',
        // Stock events
        'inventory.stock.updated',
        'inventory.low.stock',
        'inventory.out.of.stock',
        'inventory.restocked',
        // Warehouse events removed
        // Alert events
        'inventory.alert.triggered'
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
 * Claim pending events for processing (atomic-like operation)
 * Finds pending events, marks them as processing, and returns them
 */
outboxSchema.statics.claimPending = async function (limit = 50) {
  let events = [];

  try {
    const session = await mongoose.startSession().catch(() => null);

    if (session) {
      try {
        await session.withTransaction(async () => {
          // Find candidate IDs first
          const candidates = await this.find({ status: 'pending' })
            .sort({ createdAt: 1 })
            .limit(limit)
            .select('_id')
            .session(session);

          if (candidates.length === 0) return;

          const ids = candidates.map(c => c._id);

          // Update status to processing
          await this.updateMany(
            { _id: { $in: ids } },
            {
              $set: {
                status: 'processing',
                updatedAt: new Date()
              }
            },
            { session }
          );

          // Fetch full documents
          events = await this.find({ _id: { $in: ids } }).session(session).lean();
        });
        return events;
      } catch (error) {
        // Fallback to non-transactional if session fail or other session issue
        if (error.message.includes('replSet') || error.code === 20) {
          // logger would be good here
        } else {
          throw error;
        }
      } finally {
        session.endSession();
      }
    }

    // Fallback: Non-transactional claim (less safe but works in standalone)
    const candidates = await this.find({ status: 'pending' })
      .sort({ createdAt: 1 })
      .limit(limit)
      .select('_id')
      .lean();

    if (candidates.length === 0) return [];

    const ids = candidates.map(c => c._id);

    // Atomic update status to processing and return documents
    events = await this.find({ _id: { $in: ids } }).lean();

    await this.updateMany(
      { _id: { $in: ids } },
      {
        $set: {
          status: 'processing',
          updatedAt: new Date()
        }
      }
    );

    return events;

  } catch (error) {
    console.error("Error in claimPending:", error);
    return [];
  }
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
      attempts: { $inc: 1 },
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
  },

  async claimPending(limit = 50) {
    return await Outbox.claimPending(limit);
  }
};

const Outbox = mongoose.model('Outbox', outboxSchema);

// Attach service methods
Outbox.OutboxService = OutboxService;

module.exports = Outbox;

