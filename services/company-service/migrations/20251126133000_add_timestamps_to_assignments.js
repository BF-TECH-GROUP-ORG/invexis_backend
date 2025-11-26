/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.table('company_role_assignments', function (table) {
        table.timestamp('updated_at').defaultTo(knex.fn.now());
        table.string('updated_by');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.table('company_role_assignments', function (table) {
        table.dropColumn('updated_at');
        table.dropColumn('updated_by');
    });
};
