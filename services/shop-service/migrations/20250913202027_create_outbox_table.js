/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("outbox", (table) => {
    table.uuid("id").primary();
    table.string("type").notNullable(); // Event type (e.g., "shop.created")
    table.string("exchange").notNullable().defaultTo("events_topic"); // RabbitMQ exchange
    table.string("routingKey").notNullable(); // RabbitMQ routing key
    table.jsonb("payload").notNullable(); // Event payload
    table
      .enum("status", ["pending", "processing", "sent", "failed"])
      .notNullable()
      .defaultTo("pending");
    table.integer("attempts").notNullable().defaultTo(0);
    table.text("lastError").nullable();
    table.timestamp("processedAt").nullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

    // Indexes for performance
    table.index("status");
    table.index("created_at");
    table.index(["status", "created_at"]);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists("outbox");
};

