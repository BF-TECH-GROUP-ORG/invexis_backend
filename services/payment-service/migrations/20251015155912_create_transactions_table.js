// migrations/20251015155912_create_transactions_table.js (Fixed: Soft ref for payment_id—no FK)
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.raw(`
    -- Transactions Table (Partitioned: created_at first, composite PK, soft ref to payment_id)
    CREATE TABLE IF NOT EXISTS transactions (
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      id BIGSERIAL,
      transaction_id UUID DEFAULT gen_random_uuid() NOT NULL,
      payment_id UUID NOT NULL,  -- Soft ref to payments.payment_id (microservices: app-enforced)
      user_id UUID NOT NULL,
      company_id UUID,
      type transaction_type NOT NULL,
      amount BIGINT NOT NULL CHECK (ABS(amount) > 0),
      currency CHAR(3) NOT NULL,
      status transaction_status NOT NULL DEFAULT 'pending',
      gateway_transaction_id VARCHAR(255),
      metadata JSONB DEFAULT '{}'::JSONB,
      processed_at TIMESTAMP WITH TIME ZONE,
      PRIMARY KEY (created_at, id),
      UNIQUE (created_at, transaction_id)
    ) PARTITION BY RANGE (created_at);

    CREATE TABLE IF NOT EXISTS transactions_default PARTITION OF transactions DEFAULT;
    CREATE TABLE IF NOT EXISTS transactions_2025_10 PARTITION OF transactions FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.raw('DROP TABLE IF EXISTS transactions CASCADE;');
};