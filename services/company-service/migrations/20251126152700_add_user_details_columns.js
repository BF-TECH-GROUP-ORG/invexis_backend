/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.table('users', (table) => {
        table.jsonb('address').defaultTo('{}');
        table.string('role');
        table.string('position');
        table.timestamp('synced_at').defaultTo(knex.fn.now());
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.table('users', (table) => {
        table.dropColumn('address');
        table.dropColumn('role');
        table.dropColumn('position');
        table.dropColumn('synced_at');
    });
};
