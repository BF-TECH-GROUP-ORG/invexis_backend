/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('payments', function (table) {
        table.increments('id').primary();
        table.string('user_id').notNullable();
        table.decimal('amount', 10, 2).notNullable();
        table.string('payment_method').notNullable();
        table.string('company').notNullable();
        table.string('currency', 3).notNullable();
        table.string('status').notNullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

exports.down = function (knex) {
    return knex.schema.dropTableIfExists('payments');

};
