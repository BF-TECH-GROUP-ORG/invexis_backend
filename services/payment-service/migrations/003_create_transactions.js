/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.raw(`
    -- Transactions Table (Partitioned: created_at first)
    CREATE TABLE IF NOT EXISTS transactions (
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      id BIGSERIAL,
      transaction_id UUID DEFAULT gen_random_uuid() NOT NULL,
      payment_id UUID NOT NULL,
      seller_id UUID NOT NULL,
      company_id UUID,
      type transaction_type NOT NULL,
      amount BIGINT NOT NULL CHECK (ABS(amount) > 0),
      currency CHAR(3) NOT NULL DEFAULT 'XAF',
      status transaction_status NOT NULL DEFAULT 'pending',
      gateway_transaction_id VARCHAR(255),
      metadata JSONB DEFAULT '{}'::JSONB,
      processed_at TIMESTAMP WITH TIME ZONE,
      PRIMARY KEY (created_at, id),
      UNIQUE (created_at, transaction_id)
    ) PARTITION BY RANGE (created_at);

    -- Default and initial partitions
    CREATE TABLE IF NOT EXISTS transactions_default PARTITION OF transactions DEFAULT;
    CREATE TABLE IF NOT EXISTS transactions_current PARTITION OF transactions FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');
  `);
};

exports.down = function (knex) {
  return knex.raw('DROP TABLE IF EXISTS transactions CASCADE;');
};
