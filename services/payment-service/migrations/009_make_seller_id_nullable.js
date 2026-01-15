/**
 * Migration 009: Make seller_id Nullable
 * 
 * Relaxing constraint because seller_id might not be known
 * during initiation in all flows (e.g. anonymous e-commerce).
 */

exports.up = function (knex) {
    return knex.raw(`
        ALTER TABLE payments ALTER COLUMN seller_id DROP NOT NULL;
    `);
};

exports.down = function (knex) {
    return knex.raw(`
        ALTER TABLE payments ALTER COLUMN seller_id SET NOT NULL;
    `);
};
