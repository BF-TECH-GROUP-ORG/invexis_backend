/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    await knex.schema.alterTable('shops', table => {
        table.string('created_by', 255).alter();
        table.string('updated_by', 255).alter();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex.schema.alterTable('shops', table => {
        table.uuid('created_by').alter();
        table.uuid('updated_by').alter();
    });
};
