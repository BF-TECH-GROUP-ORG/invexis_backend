// migrations/20251015155917_create_indexes.js (Fixed: Removed CONCURRENTLY for dev; use in prod manually)
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.raw(`
    -- Payments Indexes (No CONCURRENTLY for dev; add in prod for zero-downtime)
    CREATE INDEX IF NOT EXISTS idx_payments_user_id_status ON payments(user_id, status) WHERE status IN ('pending', 'processing', 'succeeded');
    CREATE INDEX IF NOT EXISTS idx_payments_company_id_status ON payments(company_id, status) WHERE company_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id) WHERE order_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_payments_gateway_status_created ON payments(gateway, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_payments_metadata_gin ON payments USING GIN (metadata) WHERE metadata IS NOT NULL;

    -- Transactions Indexes
    CREATE INDEX IF NOT EXISTS idx_transactions_payment_id ON transactions(payment_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_type_status ON transactions(user_id, type, status);
    CREATE INDEX IF NOT EXISTS idx_transactions_company_type_status ON transactions(company_id, type, status) WHERE company_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_transactions_metadata_gin ON transactions USING GIN (metadata) WHERE metadata IS NOT NULL;

    -- Invoices Indexes
    CREATE INDEX IF NOT EXISTS idx_invoices_user_status ON invoices(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_invoices_company_status ON invoices(company_id, status) WHERE company_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_invoices_payment_id ON invoices(payment_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_invoices_line_items_gin ON invoices USING GIN (line_items);
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.raw(`
    DROP INDEX IF EXISTS idx_payments_user_id_status; DROP INDEX IF EXISTS idx_payments_company_id_status;
    DROP INDEX IF EXISTS idx_payments_order_id; DROP INDEX IF EXISTS idx_payments_gateway_status_created;
    DROP INDEX IF EXISTS idx_payments_created_at; DROP INDEX IF EXISTS idx_payments_metadata_gin;
    DROP INDEX IF EXISTS idx_transactions_payment_id; DROP INDEX IF EXISTS idx_transactions_user_type_status;
    DROP INDEX IF EXISTS idx_transactions_company_type_status; DROP INDEX IF EXISTS idx_transactions_created_at;
    DROP INDEX IF EXISTS idx_transactions_metadata_gin;
    DROP INDEX IF EXISTS idx_invoices_user_status; DROP INDEX IF EXISTS idx_invoices_company_status;
    DROP INDEX IF EXISTS idx_invoices_payment_id; DROP INDEX IF EXISTS idx_invoices_created_at;
    DROP INDEX IF EXISTS idx_invoices_line_items_gin;
  `);
};