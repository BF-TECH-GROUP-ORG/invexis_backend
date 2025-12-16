exports.up = function (knex) {
  return knex.raw(`
    -- Add payout_recipient_id column
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS payout_recipient_id UUID;
    
    -- Add payout_details JSONB column for storing payout information
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS payout_details JSONB DEFAULT '{}'::JSONB;
    
    -- Add payout_status column to track payout state
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payout_status') THEN
        CREATE TYPE payout_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'not_required');
      END IF;
    END
    $$;
    
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS payout_status payout_status DEFAULT 'pending';
    
    -- Add indexes
    CREATE INDEX IF NOT EXISTS idx_payments_payout_recipient ON payments(payout_recipient_id);
    CREATE INDEX IF NOT EXISTS idx_payments_payout_status ON payments(payout_status);
    
    -- Add comments
    COMMENT ON COLUMN payments.payout_recipient_id IS 'UUID of who receives the payout (seller for direct, platform for managed)';
    COMMENT ON COLUMN payments.payout_details IS 'Payout method details: {method, phone_number, bank_account, gateway}';
    COMMENT ON COLUMN payments.payout_status IS 'Status of payout to recipient';
  `);
};

exports.down = function (knex) {
  return knex.raw(`
    DROP INDEX IF EXISTS idx_payments_payout_recipient;
    DROP INDEX IF EXISTS idx_payments_payout_status;
    ALTER TABLE payments DROP COLUMN IF EXISTS payout_recipient_id;
    ALTER TABLE payments DROP COLUMN IF EXISTS payout_details;
    ALTER TABLE payments DROP COLUMN IF EXISTS payout_status;
    DROP TYPE IF EXISTS payout_status;
  `);
};
