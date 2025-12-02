/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    // Redundant migration - columns already added in create_users_replica_table
    return Promise.resolve();
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
