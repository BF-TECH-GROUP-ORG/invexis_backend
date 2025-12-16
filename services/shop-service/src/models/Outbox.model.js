"use strict";

const db = require("../config/db");
const { v4: uuidv4 } = require("uuid");

class Outbox {
  static table = "outbox";

  constructor(data) {
    this.id = data.id || uuidv4();
    this.type = data.type;
    this.exchange = data.exchange || "events_topic";
    this.routingKey = data.routingKey;
    this.payload = data.payload || {};
    this.status = data.status || "pending";
    this.attempts = data.attempts || 0;
    this.lastError = data.lastError || null;
    this.processedAt = data.processedAt || null;
    this.created_at = data.created_at || new Date();
    this.updated_at = data.updated_at || new Date();
  }

  /**
   * Create outbox event
   */
  static async create(data, trx = null) {
    const outbox = new Outbox(data);
    const query = db(this.table).insert(outbox);
    if (trx) query.transacting(trx);
    await query;
    return outbox;
  }

  /**
   * Find pending events
   */
  static async findPending(limit = 50, trx = null) {
    let query = db(this.table)
      .where({ status: "pending" })
      .orderBy("created_at", "asc")
      .limit(limit);
    if (trx) query = query.transacting(trx);
    return await query;
  }

  /**
   * Mark event as sent
   */
  static async markAsSent(id, trx = null) {
    const updateData = {
      status: "sent",
      processedAt: new Date(),
      updated_at: new Date(),
    };
    let query = db(this.table).where({ id }).update(updateData);
    if (trx) query = query.transacting(trx);
    await query;
  }

  /**
   * Mark event as failed
   */
  static async markAsFailed(id, error, trx = null) {
    const updateData = {
      attempts: db.raw("attempts + 1"),
      lastError: error?.message || String(error),
      updated_at: new Date(),
    };
    let query = db(this.table).where({ id }).update(updateData);
    if (trx) query = query.transacting(trx);
    await query;
  }

  /**
   * Reset stale processing events (older than X minutes)
   */
  static async resetStaleProcessing(minutesOld = 5, trx = null) {
    const staleTime = new Date(Date.now() - minutesOld * 60 * 1000);
    const updateData = {
      status: "pending",
      updated_at: new Date(),
    };
    let query = db(this.table)
      .where({ status: "processing" })
      .where("updated_at", "<", staleTime)
      .update(updateData);
    if (trx) query = query.transacting(trx);
    await query;
  }

  /**
   * Mark event as processing
   */
  static async markAsProcessing(id, trx = null) {
    const updateData = {
      status: "processing",
      updated_at: new Date(),
    };
    let query = db(this.table).where({ id }).update(updateData);
    if (trx) query = query.transacting(trx);
    await query;
  }

  /**
   * Get event by ID
   */
  static async findById(id, trx = null) {
    let query = db(this.table).where({ id }).first();
    if (trx) query = query.transacting(trx);
    return await query;
  }

  /**
   * Get all events by status
   */
  static async findByStatus(status, limit = 50, offset = 0, trx = null) {
    let query = db(this.table)
      .where({ status })
      .orderBy("created_at", "asc")
      .limit(limit)
      .offset(offset);
    if (trx) query = query.transacting(trx);
    return await query;
  }

  /**
   * Delete old sent events (older than X days)
   */
  static async deleteOldSentEvents(daysOld = 7, trx = null) {
    const oldDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    let query = db(this.table)
      .where({ status: "sent" })
      .where("created_at", "<", oldDate)
      .del();
    if (trx) query = query.transacting(trx);
    return await query;
  }

  /**
   * Get event count by status
   */
  static async countByStatus(status, trx = null) {
    let query = db(this.table).where({ status }).count("* as count").first();
    if (trx) query = query.transacting(trx);
    const result = await query;
    return result.count;
  }
}

/**
 * OutboxService - Helper methods for outbox operations
 */
Outbox.OutboxService = {
  /**
   * Fetch batch of pending events
   */
  async fetchBatch(limit = 50) {
    return await Outbox.findPending(limit);
  },

  /**
   * Mark event as sent
   */
  async markAsSent(id) {
    return await Outbox.markAsSent(id);
  },

  /**
   * Mark event as failed
   */
  async markAsFailed(id, error) {
    return await Outbox.markAsFailed(id, error);
  },
};

module.exports = Outbox;
