exports.up = function (knex) {
  return knex.raw(`
    -- Add shop_id column to payments table
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS shop_id UUID;
    
    -- Add index for shop_id queries
    CREATE INDEX IF NOT EXISTS idx_payments_shop_id ON payments(shop_id);
    
    -- Add comment
    COMMENT ON COLUMN payments.shop_id IS 'Shop/Store ID for marketplace payments (required for ecom/instant_buy, null for tier_upgrade)';
  `);
};

exports.down = function (knex) {
  return knex.raw(`
    DROP INDEX IF EXISTS idx_payments_shop_id;
    ALTER TABLE payments DROP COLUMN IF EXISTS shop_id;
  `);
};
