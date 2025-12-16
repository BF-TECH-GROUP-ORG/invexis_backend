exports.up = function (knex) {
  return knex.raw(`
    -- Add customer_email column to payments table
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255);
    
    -- Add comment
    COMMENT ON COLUMN payments.customer_email IS 'Email address of the customer/payer';
  `);
};

exports.down = function (knex) {
  return knex.raw(`
    ALTER TABLE payments DROP COLUMN IF EXISTS customer_email;
  `);
};
