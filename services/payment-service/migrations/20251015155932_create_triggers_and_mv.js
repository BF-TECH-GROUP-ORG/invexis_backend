// migrations/20251015155932_create_triggers_and_mv.js (Fixed: DO blocks for conditional creation, no CONCURRENTLY)
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.raw(`
    -- Trigger Function
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ language 'plpgsql';

    -- Trigger (Conditional with DO block)
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_payments_updated_at') THEN
        CREATE TRIGGER update_payments_updated_at 
        BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      END IF;
    END $$;

    -- Materialized View (Conditional with DO block)
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'mv_user_monthly_totals') THEN
        CREATE MATERIALIZED VIEW mv_user_monthly_totals AS
        SELECT 
          user_id,
          DATE_TRUNC('month', created_at) AS month,
          gateway,
          SUM(amount) / 100.0 AS total_amount,
          COUNT(*) AS txn_count
        FROM payments 
        WHERE status = 'succeeded'
        GROUP BY user_id, month, gateway;
      END IF;
    END $$;

    -- Index on MV (No CONCURRENTLY for dev)
    CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_user_monthly_totals 
    ON mv_user_monthly_totals (user_id, month, gateway);
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.raw(`
    DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
    DROP FUNCTION IF EXISTS update_updated_at_column();
    DROP MATERIALIZED VIEW IF EXISTS mv_user_monthly_totals;
    DROP INDEX IF EXISTS idx_mv_user_monthly_totals;
  `);
};