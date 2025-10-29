/**
 * @description Create event_outbox table for reliable event publishing
 */

exports.up = function (knex) {
  return knex.schema.createTable("event_outbox", (table) => {
    table.uuid("id").primary();
    table.string("event_type").notNullable();
    table.string("exchange").notNullable();
    table.string("routing_key").notNullable();
    table.jsonb("payload").notNullable();
    table.string("status").notNullable().defaultTo("pending");
    table.integer("retries").notNullable().defaultTo(0);
    table.text("error_message");
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("sent_at");
    table.timestamp("locked_at");
    table.timestamp("last_attempt_at");
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("event_outbox");
};
