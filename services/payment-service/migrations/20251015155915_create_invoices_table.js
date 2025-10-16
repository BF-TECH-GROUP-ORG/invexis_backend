// migrations/20251015155915_create_invoices_table.js (Fixed: Soft ref for payment_id—no FK)
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.raw(`
    -- Invoices Table (Partitioned: created_at first, composite PK, soft ref to payment_id)
    CREATE TABLE IF NOT EXISTS invoices (
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      id BIGSERIAL,
      invoice_id UUID DEFAULT gen_random_uuid() NOT NULL,
      payment_id UUID,  -- Soft ref to payments.payment_id (nullable, app-enforced)
      user_id UUID NOT NULL,
      company_id UUID,
      amount_due BIGINT NOT NULL CHECK (amount_due >= 0),
      currency CHAR(3) NOT NULL,
      status invoice_status NOT NULL DEFAULT 'open',
      line_items JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(line_items) = 'array'),
      pdf_url VARCHAR(500),
      metadata JSONB DEFAULT '{}'::JSONB,
      paid_at TIMESTAMP WITH TIME ZONE,
      PRIMARY KEY (created_at, id),
      UNIQUE (created_at, invoice_id)
    ) PARTITION BY RANGE (created_at);

    CREATE TABLE IF NOT EXISTS invoices_default PARTITION OF invoices DEFAULT;
    CREATE TABLE IF NOT EXISTS invoices_2025_10 PARTITION OF invoices FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.raw('DROP TABLE IF EXISTS invoices CASCADE;');
}; 