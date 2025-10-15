// migrations/20251015155909_create_payments_table.js (Unchanged: Already fixed)
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.raw(`
    -- Extension for UUIDs (if not exists)
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    -- Payments Table (Partitioned: created_at first, composite PK/UNIQUE)
    CREATE TABLE IF NOT EXISTS payments (
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      id BIGSERIAL,
      payment_id UUID DEFAULT gen_random_uuid() NOT NULL,
      user_id UUID NOT NULL,
      company_id UUID,
      order_id UUID,
      amount BIGINT NOT NULL CHECK (amount > 0),
      currency CHAR(3) NOT NULL DEFAULT 'XAF' CHECK (currency ~ '^[A-Z]{3}$'),
      description TEXT NOT NULL CHECK (length(description) <= 500),
      method payment_method NOT NULL,
      gateway gateway_type NOT NULL,
      gateway_token VARCHAR(255),
      status payment_status NOT NULL DEFAULT 'pending',
      failure_reason TEXT CHECK (length(failure_reason) <= 255),
      cancellation_reason TEXT CHECK (length(cancellation_reason) <= 255),
      metadata JSONB DEFAULT '{}'::JSONB,
      ip INET,
      device_fingerprint VARCHAR(255),
      location JSONB DEFAULT '{}'::JSONB,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at TIMESTAMP WITH TIME ZONE,
      PRIMARY KEY (created_at, id),
      UNIQUE (created_at, payment_id)
    ) PARTITION BY RANGE (created_at);

    -- Default and example partition
    CREATE TABLE IF NOT EXISTS payments_default PARTITION OF payments DEFAULT;
    CREATE TABLE IF NOT EXISTS payments_2025_10 PARTITION OF payments FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.raw('DROP TABLE IF EXISTS payments CASCADE;');
};