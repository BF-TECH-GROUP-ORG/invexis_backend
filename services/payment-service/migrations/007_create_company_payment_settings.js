/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.raw(`
    CREATE TABLE IF NOT EXISTS company_payment_settings (
      company_id UUID PRIMARY KEY,
      momo_phone VARCHAR(20),
      airtel_phone VARCHAR(20),
      stripe_account_id VARCHAR(255),
      metadata JSONB DEFAULT '{}'::JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Add update trigger for updated_at
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_company_payment_settings_updated_at') THEN
        CREATE TRIGGER update_company_payment_settings_updated_at
        BEFORE UPDATE ON company_payment_settings
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      END IF;
    END $$;
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.raw(`
    DROP TABLE IF EXISTS company_payment_settings;
  `);
};
