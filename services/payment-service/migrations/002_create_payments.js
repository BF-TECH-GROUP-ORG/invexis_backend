/**
 * Migration 002: Core Payments and Subscription Tracking
 * Consolidated from 18 scattered migrations into a clean, partitioned schema.
 * 
 * Includes: 
 * - Multi-month partitioning (Dec 2025 - Feb 2026)
 * - Consolidated customer object {name, email, phone}
 * - E-commerce payout logic support
 */

exports.up = function (knex) {
  return knex.raw(`
    -- Extension for UUIDs (Required for gen_random_uuid)
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    -- Payments Table (Partitioned by created_at)
    -- This table handles all financial transactions: SALES, DEBTS, ECOMM, etc.
    CREATE TABLE IF NOT EXISTS payments (
      -- Partition Key & Identifiers
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      id BIGSERIAL,
      payment_id UUID DEFAULT gen_random_uuid() NOT NULL,

      -- Relational IDs
      seller_id UUID NOT NULL,             -- Payer/Recipient
      company_id UUID,                     -- Optional Corporate Identity
      shop_id UUID,                        -- Physical/Digital Shop Reference
      order_id VARCHAR(255),               -- Source Order ID

      -- Financial Data
      amount BIGINT NOT NULL CHECK (amount > 0),
      currency CHAR(3) NOT NULL DEFAULT 'XAF',
      description TEXT NOT NULL CHECK (length(description) <= 500),
      
      -- Routing & Methods
      type payment_type NOT NULL DEFAULT 'SALE',
      method payment_method NOT NULL DEFAULT 'manual',
      gateway gateway_type NOT NULL DEFAULT 'manual',
      gateway_token VARCHAR(255),          -- Reference code from Stripe/Momo
      
      -- State Management
      status payment_status NOT NULL DEFAULT 'pending',
      failure_reason TEXT CHECK (length(failure_reason) <= 255),
      cancellation_reason TEXT CHECK (length(cancellation_reason) <= 255),
      
      -- Advanced Data Objects
      metadata JSONB DEFAULT '{}'::JSONB,
      customer JSONB DEFAULT '{}'::JSONB,  -- Consolidated: {name, email, phone}
      line_items JSONB DEFAULT '[]'::JSONB CHECK (jsonb_typeof(line_items) = 'array'),
      
      -- Production Routing Features
      reference_id VARCHAR(255),           -- External tracking ID
      idempotency_key VARCHAR(255),        -- Duplicate avoidance
      retry_count INTEGER DEFAULT 0,
      next_retry_at TIMESTAMP WITH TIME ZONE,
      gateway_details JSONB DEFAULT '{}'::JSONB,
      
      -- E-Commerce Payout Specifics
      payout_recipient_id UUID,
      payout_details JSONB DEFAULT '{}'::JSONB,
      payout_status payout_status DEFAULT 'not_required',
      
      -- Contextual Data
      location JSONB DEFAULT '{}'::JSONB,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at TIMESTAMP WITH TIME ZONE,

      PRIMARY KEY (created_at, id),
      UNIQUE (created_at, payment_id)
    ) PARTITION BY RANGE (created_at);

    -- Professional Partitioning Strategy
    CREATE TABLE IF NOT EXISTS payments_default PARTITION OF payments DEFAULT;
    CREATE TABLE IF NOT EXISTS payments_2025_12 PARTITION OF payments FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');
    CREATE TABLE IF NOT EXISTS payments_2026_01 PARTITION OF payments FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
    CREATE TABLE IF NOT EXISTS payments_2026_02 PARTITION OF payments FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
  `);
};

exports.down = function (knex) {
  return knex.raw(`
    DROP TABLE IF EXISTS payments CASCADE;
  `);
};
