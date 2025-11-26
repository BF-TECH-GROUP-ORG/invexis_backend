// migrations/20251126_create_seller_monthly_mv.js
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'mv_seller_monthly_totals') THEN
        CREATE MATERIALIZED VIEW mv_seller_monthly_totals AS
        SELECT 
          seller_id,
          DATE_TRUNC('month', created_at) AS month,
          gateway,
          SUM(amount) / 100.0 AS total_amount,
          COUNT(*) AS txn_count
        FROM payments
        WHERE status = 'succeeded'
        GROUP BY seller_id, month, gateway;
      END IF;
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_seller_monthly_totals
      ON mv_seller_monthly_totals(seller_id, month, gateway);
  `);
};

exports.down = function (knex) {
    return knex.raw(`
    DROP MATERIALIZED VIEW IF EXISTS mv_seller_monthly_totals;
    DROP INDEX IF EXISTS idx_mv_seller_monthly_totals;
  `);
};
