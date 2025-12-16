// migrations/20251126_create_enums.js
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.raw(`
    -- Gateway types (added Mpesa)
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gateway_type') THEN
        CREATE TYPE gateway_type AS ENUM ('stripe', 'mtn_momo', 'airtel_money', 'mpesa');
      END IF;
    END
    $$;

    -- Payment status
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
        CREATE TYPE payment_status AS ENUM ('pending', 'processing', 'succeeded', 'failed', 'cancelled');
      END IF;
    END
    $$;

    -- Transaction type
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_type') THEN
        CREATE TYPE transaction_type AS ENUM ('charge', 'void', 'capture', 'dispute');
      END IF;
    END
    $$;

    -- Transaction status
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_status') THEN
        CREATE TYPE transaction_status AS ENUM ('pending', 'succeeded', 'failed');
      END IF;
    END
    $$;

    -- Payment method
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
        CREATE TYPE payment_method AS ENUM ('card', 'mobile_money', 'bank_transfer');
      END IF;
    END
    $$;

    -- Invoice status
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_status') THEN
        CREATE TYPE invoice_status AS ENUM ('draft', 'open', 'paid', 'void');
      END IF;
    END
    $$;
  `);
};

exports.down = function (knex) {
  return knex.raw(`
    DROP TYPE IF EXISTS gateway_type CASCADE;
    DROP TYPE IF EXISTS payment_status CASCADE;
    DROP TYPE IF EXISTS transaction_type CASCADE;
    DROP TYPE IF EXISTS transaction_status CASCADE;
    DROP TYPE IF EXISTS payment_method CASCADE;
    DROP TYPE IF EXISTS invoice_status CASCADE;
  `);
};
