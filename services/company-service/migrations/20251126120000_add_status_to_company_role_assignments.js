/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.table('company_role_assignments', function (table) {
        table.string('status').defaultTo('active'); // active, suspended
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.table('company_role_assignments', function (table) {
        table.dropColumn('status');
    });
};
