/**
 * Migration 008: Fix UUID Column Types
 * 
 * Changes idempotency_key and order_id from UUID to VARCHAR(255)
 * to support custom strings and external references.
 */

exports.up = function (knex) {
    return knex.raw(`
        ALTER TABLE payments ALTER COLUMN idempotency_key TYPE VARCHAR(255);
        ALTER TABLE payments ALTER COLUMN order_id TYPE VARCHAR(255);
    `);
};

exports.down = function (knex) {
    return knex.raw(`
        -- Note: Reverting to UUID might fail if existing data is not valid UUIDs
        ALTER TABLE payments ALTER COLUMN idempotency_key TYPE UUID USING idempotency_key::uuid;
        ALTER TABLE payments ALTER COLUMN order_id TYPE UUID USING order_id::uuid;
    `);
};
