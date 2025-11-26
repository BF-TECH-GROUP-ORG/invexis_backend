/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('users', (table) => {
        table.string('id').primary(); // UUID from auth-service
        table.string('first_name');
        table.string('last_name');
        table.string('email');
        table.string('phone');
        table.string('profile_picture');
        table.jsonb('address').defaultTo('{}'); // { street, city, state, country, postalCode }
        table.string('role'); // customer, worker, shop_manager, company_admin
        table.string('position'); // job title
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
        table.timestamp('synced_at').defaultTo(knex.fn.now()); // last sync from auth-service

        // Indexes for common queries
        table.index('email');
        table.index('role');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTableIfExists('users');
};
