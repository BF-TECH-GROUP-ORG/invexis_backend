/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable("companies", (table) => {
        // Change column type from UUID to String to support other ID formats (e.g., MongoDB ObjectIds)
        table.string("company_admin_id").alter();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable("companies", (table) => {
        // Revert back to UUID
        // Note: detailed cast might be needed using raw SQL if explicit casting is required by PG,
        // but knex .alter() usually attempts standard cast.
        // If column contains non-UUIDs, this will fail.
        table.uuid("company_admin_id").alter();
    });
};
