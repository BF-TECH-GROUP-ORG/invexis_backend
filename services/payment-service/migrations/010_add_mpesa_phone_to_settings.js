/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.raw(`
    ALTER TABLE company_payment_settings 
    ADD COLUMN IF NOT EXISTS mpesa_phone VARCHAR(20);
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.raw(`
    ALTER TABLE company_payment_settings 
    DROP COLUMN IF EXISTS mpesa_phone;
  `);
};
