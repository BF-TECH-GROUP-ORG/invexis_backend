exports.up = function (knex) {
  return knex.raw(`
    -- Add line_items JSONB column to payments table
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS line_items JSONB DEFAULT '[]'::JSONB;
    
    -- Add comment
    COMMENT ON COLUMN payments.line_items IS 'Array of items purchased: [{name, quantity, unit_price, total}]';
  `);
};

exports.down = function (knex) {
  return knex.raw(`
    ALTER TABLE payments DROP COLUMN IF EXISTS line_items;
  `);
};
