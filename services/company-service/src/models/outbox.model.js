"use strict";

const db = require("../config");
const { v4: uuidv4 } = require("uuid");

class Outbox {
  static table = "event_outbox";
  static RETRY_LIMIT = 10;

  /**
   * Create a new outbox record (supports transactions)
   * @param {object} event - Event data
   * @param {object} trx - Optional Knex transaction
   */
  static async create(event, trx = null) {
    const record = {
      id: uuidv4(),
      event_type: event.type,
      exchange: event.exchange,
      routing_key: event.routingKey,
      payload: JSON.stringify({
        ...event.payload,
        trace_id: event.payload?.trace_id || uuidv4(),
      }),
      status: "pending",
      retries: 0,
      created_at: new Date(),
    };

    const query = db(this.table);
    if (trx) query.transacting(trx);
    await query.insert(record);

    return record;
  }

  /**
   * Fetch pending events (safe for concurrent workers)
   */
  static async fetchBatch(limit = 50) {
    return await db(this.table)
      .where({ status: "pending" })
      .orderBy("created_at", "asc")
      .limit(limit);
  }

  /**
   * Atomically claim events for processing (avoid race conditions)
   */
  static async claimPending(limit = 50) {
    // Mark events as "processing" to prevent double pickup
    const claimed = await db.transaction(async (trx) => {
      const rows = await trx(this.table)
        .select("*")
        .where({ status: "pending" })
        .orderBy("created_at", "asc")
        .limit(limit)
        .forUpdate();

      const ids = rows.map((r) => r.id);
      if (ids.length) {
        await trx(this.table).whereIn("id", ids).update({
          status: "processing",
          locked_at: new Date(),
        });
      }

      return rows;
    });

    return claimed;
  }

  static async markAsSent(id) {
    await db(this.table).where({ id }).update({
      status: "sent",
      sent_at: new Date(),
    });
  }

  static async markAsFailed(id, error) {
    const event = await db(this.table).where({ id }).first();
    const retries = (event?.retries || 0) + 1;

    const nextStatus =
      retries >= this.RETRY_LIMIT ? "permanent_failed" : "pending";

    await db(this.table)
      .where({ id })
      .update({
        status: nextStatus,
        error_message: error.message || "Unknown error",
        retries,
        last_attempt_at: new Date(),
      });
  }

  /**
   * Reset "processing" events older than X minutes (e.g. crash recovery)
   */
  static async resetStaleProcessing(minutes = 5) {
    const cutoff = new Date(Date.now() - minutes * 60000);
    await db(this.table)
      .where("status", "processing")
      .andWhere("locked_at", "<", cutoff)
      .update({
        status: "pending",
        locked_at: null,
      });
  }

  static async findPending(limit = 50) {
    return db(this.table)
      .where({ status: "pending" })
      .orderBy("created_at", "asc")
      .limit(limit);
  }
}

module.exports = Outbox;
