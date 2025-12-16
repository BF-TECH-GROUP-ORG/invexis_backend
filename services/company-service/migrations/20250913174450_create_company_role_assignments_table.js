/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('company_role_assignments', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('company_id').unsigned().notNullable()
            .references('id').inTable('companies')
            .onDelete('CASCADE');
        table.uuid('role_id').unsigned().notNullable()
            .references('id').inTable('company_roles')
            .onDelete('CASCADE');
        table.string('user_id').notNullable(); // Auth Service user ID
        table.jsonb('permissions_override').defaultTo('{}'); // optional
        table.string('assigned_by'); // user ID of who assigned
        table.timestamp('assigned_at').defaultTo(knex.fn.now());
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTableIfExists('company_role_assignments');
};