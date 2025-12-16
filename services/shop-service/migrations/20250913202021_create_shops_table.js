/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('shops', table => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('company_id').notNullable();
        table.string('name', 255).notNullable();
        table.string('address_line1', 255).notNullable();
        table.string('address_line2', 255);
        table.string('city', 100).notNullable();
        table.string('region', 100);
        table.string('country', 2).notNullable();
        table.string('postal_code', 20);
        table.decimal('latitude', 9, 6);
        table.decimal('longitude', 9, 6);
        table.integer('capacity').notNullable().defaultTo(0);
        table.string('timezone', 50).notNullable();
        table.enum('status', ['open', 'closed']).notNullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
        table.uuid('created_by');
        table.uuid('updated_by');
        table.timestamp('deleted_at');

        table.unique(['company_id', 'name']);
        table.index('company_id');
        table.index('status');
    });
};


/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTableIfExists('shops');
};

