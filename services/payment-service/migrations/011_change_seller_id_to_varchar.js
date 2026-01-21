/**
 * Migration 011: Change seller_id from UUID to VARCHAR
 * 
 * Users are managed by MongoDB (auth-service), so seller_id should accept
 * MongoDB ObjectId strings (24-character hex strings) instead of UUIDs.
 */

exports.up = function (knex) {
    return knex.raw(`
        -- Change seller_id in payments table to VARCHAR
        ALTER TABLE payments ALTER COLUMN seller_id TYPE VARCHAR(255);
        
        -- Change seller_id in transactions table to VARCHAR
        ALTER TABLE transactions ALTER COLUMN seller_id TYPE VARCHAR(255);
        
        -- Change seller_id in invoices table to VARCHAR
        ALTER TABLE invoices ALTER COLUMN seller_id TYPE VARCHAR(255);
        
        -- Remove line_items check constraint that's too strict
        ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_line_items_check;
    `);
};

exports.down = function (knex) {
    return knex.raw(`
        -- Revert seller_id in payments table to UUID
        ALTER TABLE payments ALTER COLUMN seller_id TYPE UUID USING seller_id::UUID;
        
        -- Revert seller_id in transactions table to UUID
        ALTER TABLE transactions ALTER COLUMN seller_id TYPE UUID USING seller_id::UUID;
        
        -- Revert seller_id in invoices table to UUID
        ALTER TABLE invoices ALTER COLUMN seller_id TYPE UUID USING seller_id::UUID;
        
        -- Restore line_items check constraint
        ALTER TABLE invoices ADD CONSTRAINT invoices_line_items_check CHECK (jsonb_typeof(line_items) = 'array');
    `);
};
