/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('company_roles', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('company_id').unsigned().notNullable()
            .references('id').inTable('companies')
            .onDelete('CASCADE');
        table.string('name').notNullable(); // e.g., "Sales ReadOnly"
        table.string('domain').notNullable(); // e.g., sales, inventory
        table.jsonb('permissions').defaultTo('{}'); // default permissions
        table.text('description');
        table.timestamps(true, true);
    });
};



/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTableIfExists('company_roles');
};
