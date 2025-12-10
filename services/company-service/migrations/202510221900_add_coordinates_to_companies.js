/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const exists = await knex.schema.hasColumn("companies", "coordinates");
  if (!exists) {
    await knex.schema.alterTable("companies", (table) => {
      table
        .jsonb("coordinates")
        .nullable()
        .comment("Stores lat/lng pair as JSON");
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const exists = await knex.schema.hasColumn("companies", "coordinates");
  if (exists) {
    await knex.schema.alterTable("companies", (table) => {
      table.dropColumn("coordinates");
    });
  }
};
