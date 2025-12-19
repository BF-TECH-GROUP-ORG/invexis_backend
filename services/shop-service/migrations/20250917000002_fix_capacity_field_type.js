/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('shops', table => {
        // Change capacity from integer to bigInteger to handle large values
        table.bigInteger('capacity').alter();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable('shops', table => {
        // Revert back to integer
        table.integer('capacity').alter();
    });
};
