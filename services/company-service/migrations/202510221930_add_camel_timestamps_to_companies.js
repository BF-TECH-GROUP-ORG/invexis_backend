/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Add camelCase timestamp columns if they don't exist
  const hasCreatedAt = await knex.schema.hasColumn("companies", "createdAt");
  const hasUpdatedAt = await knex.schema.hasColumn("companies", "updatedAt");

  if (!hasCreatedAt || !hasUpdatedAt) {
    await knex.schema.alterTable("companies", (table) => {
      if (!hasCreatedAt)
        table.timestamp("createdAt", { useTz: true }).defaultTo(knex.fn.now());
      if (!hasUpdatedAt)
        table.timestamp("updatedAt", { useTz: true }).defaultTo(knex.fn.now());
    });
  }

  // Create a function and trigger to keep updatedAt in sync on UPDATE
  await knex.raw(`
    CREATE OR REPLACE FUNCTION set_updatedAt_camelcase()
    RETURNS trigger AS $$
    BEGIN
      NEW."updatedAt" = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Create trigger (one per table) if not exists
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'companies_set_updatedAt_camelcase'
      ) THEN
        CREATE TRIGGER companies_set_updatedAt_camelcase
        BEFORE UPDATE ON companies
        FOR EACH ROW
        EXECUTE FUNCTION set_updatedAt_camelcase();
      END IF;
    END;
    $$;
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  // Drop trigger, function and columns if present
  await knex.raw(`
    DROP TRIGGER IF EXISTS companies_set_updatedAt_camelcase ON companies;
    DROP FUNCTION IF EXISTS set_updatedAt_camelcase();
  `);

  const hasCreatedAt = await knex.schema.hasColumn("companies", "createdAt");
  const hasUpdatedAt = await knex.schema.hasColumn("companies", "updatedAt");

  if (hasCreatedAt || hasUpdatedAt) {
    await knex.schema.alterTable("companies", (table) => {
      if (hasCreatedAt) table.dropColumn("createdAt");
      if (hasUpdatedAt) table.dropColumn("updatedAt");
    });
  }
};
