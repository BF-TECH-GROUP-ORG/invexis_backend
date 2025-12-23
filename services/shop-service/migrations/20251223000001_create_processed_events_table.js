/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable("processed_events", (table) => {
        table.uuid("id").primary();
        table.string("event_id").notNullable();
        table.string("event_type").notNullable();
        table.timestamp("processed_at").notNullable().defaultTo(knex.fn.now());
        table.text("metadata").nullable(); // JSON string of metadata
        table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

        // Unique constraint to prevent duplicate event processing
        table.unique(["event_id", "event_type"]);

        // Indexes for performance
        table.index("event_type");
        table.index("processed_at");
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTableIfExists("processed_events");
};
