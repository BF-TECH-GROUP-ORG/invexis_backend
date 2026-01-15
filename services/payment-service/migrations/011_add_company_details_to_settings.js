/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.table('company_payment_settings', function (table) {
        table.string('company_name').nullable();
        table.string('company_email').nullable();
        table.string('company_phone').nullable();
        table.text('company_address').nullable();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.table('company_payment_settings', function (table) {
        table.dropColumn('company_name');
        table.dropColumn('company_email');
        table.dropColumn('company_phone');
        table.dropColumn('company_address');
    });
};
