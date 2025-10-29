/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("subscriptions", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    table
      .uuid("company_id")
      .notNullable()
      .references("id")
      .inTable("companies")
      .onDelete("CASCADE");

    table.string("tier").notNullable().defaultTo("basic");
    table.decimal("amount", 10, 2).notNullable().defaultTo(0);
    table.string("currency").notNullable().defaultTo("RWF");
    table.timestamp("start_date").notNullable();
    table.timestamp("end_date").notNullable();
    table.boolean("is_active").defaultTo(true);
    table.string("payment_reference");
    table.jsonb("metadata").defaultTo("{}");

    // Audit
    table.string("createdBy");
    table.string("updatedBy");

    // CamelCase timestamps (explicit)
    table.timestamp("createdAt", { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp("updatedAt", { useTz: true }).defaultTo(knex.fn.now());
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists("subscriptions");
};
