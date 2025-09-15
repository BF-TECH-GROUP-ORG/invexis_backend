/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('shop_operating_hours', table => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('shop_id').notNullable().references('id').inTable('shops').onDelete('CASCADE');
        table.specificType('day_of_week', 'smallint').notNullable();
        table.time('open_time');
        table.time('close_time');
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
        table.uuid('created_by');
        table.uuid('updated_by');
        table.timestamp('deleted_at');

        table.unique(['shop_id', 'day_of_week']);
    });
};




/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTableIfExists('shop_operating_hours');
};
