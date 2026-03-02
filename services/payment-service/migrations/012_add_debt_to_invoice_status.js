/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    // Add 'debt' to invoice_status enum
    // Note: PostgreSQL doesn't support adding enum values within a transaction block prior to v12
    // but knex migrations usually run in a transaction. We use raw to run it.
    return knex.raw(`
        ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'debt';
    `);
};

exports.down = function (knex) {
    // Note: PostgreSQL doesn't support removing enum values easily.
    // Usually, we just leave it or recreate the type if absolutely necessary.
    // For this migration, we'll do nothing on down to avoid breaking data.
    return Promise.resolve();
};
