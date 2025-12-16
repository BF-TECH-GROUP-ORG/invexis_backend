// migrations/20251126001_create_november_partitions.js
/**
 * Create partitions for November 2025 for payments, transactions, and invoices
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.raw(`
    -- Create November 2025 partition for payments
    CREATE TABLE IF NOT EXISTS payments_2025_11 
    PARTITION OF payments 
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

    -- Create November 2025 partition for transactions
    CREATE TABLE IF NOT EXISTS transactions_2025_11 
    PARTITION OF transactions 
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

    -- Create November 2025 partition for invoices
    CREATE TABLE IF NOT EXISTS invoices_2025_11 
    PARTITION OF invoices 
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

    -- Create December 2025 partitions (for upcoming month)
    CREATE TABLE IF NOT EXISTS payments_2025_12 
    PARTITION OF payments 
    FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

    CREATE TABLE IF NOT EXISTS transactions_2025_12 
    PARTITION OF transactions 
    FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

    CREATE TABLE IF NOT EXISTS invoices_2025_12 
    PARTITION OF invoices 
    FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.raw(`
    DROP TABLE IF EXISTS payments_2025_11;
    DROP TABLE IF EXISTS transactions_2025_11;
    DROP TABLE IF EXISTS invoices_2025_11;
    DROP TABLE IF EXISTS payments_2025_12;
    DROP TABLE IF EXISTS transactions_2025_12;
    DROP TABLE IF EXISTS invoices_2025_12;
  `);
};
