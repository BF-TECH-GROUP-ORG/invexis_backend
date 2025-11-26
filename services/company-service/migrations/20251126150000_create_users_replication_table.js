/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 * 
 * This migration was already run - this is a placeholder to satisfy knex
 */
exports.up = function (knex) {
    // Already executed - no-op
    return Promise.resolve();
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTableIfExists('users');
};
