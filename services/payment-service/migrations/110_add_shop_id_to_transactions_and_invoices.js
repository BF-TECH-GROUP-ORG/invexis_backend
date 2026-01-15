/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.raw(`
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS shop_id UUID;
    CREATE INDEX IF NOT EXISTS idx_transactions_shop_id ON transactions(shop_id);

    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS shop_id UUID;
    CREATE INDEX IF NOT EXISTS idx_invoices_shop_id ON invoices(shop_id);
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.raw(`
    ALTER TABLE transactions DROP COLUMN IF EXISTS shop_id;
    ALTER TABLE invoices DROP COLUMN IF EXISTS shop_id;
  `);
};
