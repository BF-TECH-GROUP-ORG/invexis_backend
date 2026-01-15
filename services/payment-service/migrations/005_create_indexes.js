/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.raw(`
    -- Payments Indexes
    CREATE INDEX IF NOT EXISTS idx_payments_seller_id_status ON payments(seller_id, status) WHERE status IN ('pending','processing','succeeded');
    CREATE INDEX IF NOT EXISTS idx_payments_company_id_status ON payments(company_id, status) WHERE company_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id) WHERE order_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_payments_gateway_status_created ON payments(gateway, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_payments_metadata_gin ON payments USING GIN(metadata) WHERE metadata IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_payments_reference_id ON payments(reference_id);
    CREATE INDEX IF NOT EXISTS idx_payments_idempotency_key ON payments(idempotency_key);
    CREATE INDEX IF NOT EXISTS idx_payments_next_retry ON payments(next_retry_at) WHERE status = 'failed';
    CREATE INDEX IF NOT EXISTS idx_payments_payout_recipient ON payments(payout_recipient_id);
    CREATE INDEX IF NOT EXISTS idx_payments_payout_status ON payments(payout_status);

    -- Transactions Indexes
    CREATE INDEX IF NOT EXISTS idx_transactions_payment_id ON transactions(payment_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_seller_type_status ON transactions(seller_id, type, status);
    CREATE INDEX IF NOT EXISTS idx_transactions_company_type_status ON transactions(company_id, type, status) WHERE company_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_transactions_metadata_gin ON transactions USING GIN(metadata) WHERE metadata IS NOT NULL;

    -- Invoices Indexes
    CREATE INDEX IF NOT EXISTS idx_invoices_seller_status ON invoices(seller_id, status);
    CREATE INDEX IF NOT EXISTS idx_invoices_company_status ON invoices(company_id, status) WHERE company_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_invoices_payment_id ON invoices(payment_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_invoices_line_items_gin ON invoices USING GIN(line_items);
  `);
};

exports.down = function (knex) {
  return knex.raw(`
    DROP INDEX IF EXISTS idx_payments_user_id_status;
    DROP INDEX IF EXISTS idx_payments_seller_id_status;
    DROP INDEX IF EXISTS idx_payments_company_id_status;
    DROP INDEX IF EXISTS idx_payments_order_id;
    DROP INDEX IF EXISTS idx_payments_gateway_status_created;
    DROP INDEX IF EXISTS idx_payments_created_at;
    DROP INDEX IF EXISTS idx_payments_metadata_gin;
    DROP INDEX IF EXISTS idx_payments_reference_id;
    DROP INDEX IF EXISTS idx_payments_idempotency_key;
    DROP INDEX IF EXISTS idx_payments_next_retry;
    DROP INDEX IF EXISTS idx_payments_payout_recipient;
    DROP INDEX IF EXISTS idx_payments_payout_status;

    DROP INDEX IF EXISTS idx_transactions_payment_id;
    DROP INDEX IF EXISTS idx_transactions_user_type_status;
    DROP INDEX IF EXISTS idx_transactions_seller_type_status;
    DROP INDEX IF EXISTS idx_transactions_company_type_status;
    DROP INDEX IF EXISTS idx_transactions_created_at;
    DROP INDEX IF EXISTS idx_transactions_metadata_gin;

    DROP INDEX IF EXISTS idx_invoices_user_status;
    DROP INDEX IF EXISTS idx_invoices_seller_status;
    DROP INDEX IF EXISTS idx_invoices_company_status;
    DROP INDEX IF EXISTS idx_invoices_payment_id;
    DROP INDEX IF EXISTS idx_invoices_created_at;
    DROP INDEX IF EXISTS idx_invoices_line_items_gin;
  `);
};
