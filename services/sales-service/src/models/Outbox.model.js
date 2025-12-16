"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");
const { v4: uuidv4 } = require("uuid");

/**
 * Event Outbox Model for Transactional Outbox Pattern
 * Ensures reliable event publishing with database transactions
 */
const Outbox = sequelize.define(
  "Outbox",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "event_type",
    },
    exchange: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    routingKey: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "routing_key",
    },
    payload: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("pending", "processing", "sent", "permanent_failed"),
      defaultValue: "pending",
      allowNull: false,
    },
    retries: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    errorMessage: {
      type: DataTypes.TEXT,
      field: "error_message",
    },
    sentAt: {
      type: DataTypes.DATE,
      field: "sent_at",
    },
    lockedAt: {
      type: DataTypes.DATE,
      field: "locked_at",
    },
    lastAttemptAt: {
      type: DataTypes.DATE,
      field: "last_attempt_at",
    },
  },
  {
    tableName: "event_outbox",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false,
  }
);

/**
 * Static methods for Outbox operations
 */
class OutboxService {
  static RETRY_LIMIT = 5;

  /**
   * Create a new outbox record (supports transactions)
   * @param {object} event - Event data
   * @param {object} transaction - Optional Sequelize transaction
   */
  static async create(event, transaction = null) {
    const record = {
      id: uuidv4(),
      eventType: event.type,
      exchange: event.exchange,
      routingKey: event.routingKey,
      payload: {
        ...event.payload,
        trace_id: event.payload?.trace_id || uuidv4(),
      },
      status: "pending",
      retries: 0,
    };

    const options = transaction ? { transaction } : {};
    await Outbox.create(record, options);

    return record;
  }

  /**
   * Fetch pending events (safe for concurrent workers)
   */
  static async fetchBatch(limit = 50) {
    return await Outbox.findAll({
      where: { status: "pending" },
      order: [["created_at", "ASC"]],
      limit,
    });
  }

  /**
   * Atomically claim events for processing (avoid race conditions)
   */
  static async claimPending(limit = 50) {
    const transaction = await sequelize.transaction();

    try {
      // Lock rows for update
      const rows = await Outbox.findAll({
        where: { status: "pending" },
        order: [["created_at", "ASC"]],
        limit,
        lock: transaction.LOCK.UPDATE,
        transaction,
      });

      const ids = rows.map((r) => r.id);

      if (ids.length > 0) {
        await Outbox.update(
          {
            status: "processing",
            lockedAt: new Date(),
          },
          {
            where: { id: ids },
            transaction,
          }
        );
      }

      await transaction.commit();
      return rows;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Mark event as successfully sent
   */
  static async markAsSent(id) {
    await Outbox.update(
      {
        status: "sent",
        sentAt: new Date(),
      },
      {
        where: { id },
      }
    );
  }

  /**
   * Mark event as failed and increment retry count
   */
  static async markAsFailed(id, error) {
    const event = await Outbox.findByPk(id);
    const retries = (event?.retries || 0) + 1;

    const nextStatus =
      retries >= this.RETRY_LIMIT ? "permanent_failed" : "pending";

    await Outbox.update(
      {
        status: nextStatus,
        errorMessage: error.message || "Unknown error",
        retries,
        lastAttemptAt: new Date(),
      },
      {
        where: { id },
      }
    );
  }

  /**
   * Reset "processing" events older than X minutes (crash recovery)
   */
  static async resetStaleProcessing(minutes = 5) {
    const { Op } = require("sequelize");
    const cutoff = new Date(Date.now() - minutes * 60000);

    await Outbox.update(
      {
        status: "pending",
        lockedAt: null,
      },
      {
        where: {
          status: "processing",
          lockedAt: {
            [Op.lt]: cutoff,
          },
        },
      }
    );
  }

  /**
   * Find pending events
   */
  static async findPending(limit = 50) {
    return await Outbox.findAll({
      where: { status: "pending" },
      order: [["created_at", "ASC"]],
      limit,
    });
  }

  /**
   * Get statistics
   */
  static async getStats() {
    const { Op } = require("sequelize");
    
    const [pending, processing, sent, failed] = await Promise.all([
      Outbox.count({ where: { status: "pending" } }),
      Outbox.count({ where: { status: "processing" } }),
      Outbox.count({ where: { status: "sent" } }),
      Outbox.count({ where: { status: "permanent_failed" } }),
    ]);

    return { pending, processing, sent, failed };
  }
}

// Attach static methods to the model
Outbox.OutboxService = OutboxService;

module.exports = Outbox;
module.exports.OutboxService = OutboxService;

