/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // 1) add camelCase audit columns if they don't exist
  const hasCreatedBy = await knex.schema.hasColumn("companies", "createdBy");
  const hasUpdatedBy = await knex.schema.hasColumn("companies", "updatedBy");

  if (!hasCreatedBy || !hasUpdatedBy) {
    await knex.schema.alterTable("companies", (table) => {
      if (!hasCreatedBy)
        table
          .string("createdBy")
          .nullable()
          .comment("CamelCase alias for created_by");
      if (!hasUpdatedBy)
        table
          .string("updatedBy")
          .nullable()
          .comment("CamelCase alias for updated_by");
    });
  }

  // 2) backfill values from snake_case to camelCase to preserve existing data
  await knex.raw(`
    UPDATE companies
    SET "createdBy" = COALESCE("createdBy", created_by),
        "updatedBy" = COALESCE("updatedBy", updated_by)
    WHERE ("createdBy" IS NULL OR "updatedBy" IS NULL)
      AND (created_by IS NOT NULL OR updated_by IS NOT NULL);
  `);

  // 3) Create a function to keep the two naming styles in sync on INSERT/UPDATE
  await knex.raw(`
    CREATE OR REPLACE FUNCTION companies_sync_audit_columns()
    RETURNS trigger AS $$
    BEGIN
      -- On INSERT: prefer supplied camelCase values, else fallback to snake_case
      IF (TG_OP = 'INSERT') THEN
        NEW."createdBy"  := COALESCE(NEW."createdBy", NEW.created_by);
        NEW.created_by   := COALESCE(NEW.created_by, NEW."createdBy");
      END IF;

      -- On INSERT or UPDATE: keep updated fields in sync
      NEW."updatedBy" := COALESCE(NEW."updatedBy", NEW.updated_by, OLD."updatedBy");
      NEW.updated_by  := COALESCE(NEW.updated_by, NEW."updatedBy", OLD.updated_by);

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // 4) Create trigger (idempotent pattern using pg_trigger lookup)
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'companies_sync_audit_columns_tr'
      ) THEN
        CREATE TRIGGER companies_sync_audit_columns_tr
        BEFORE INSERT OR UPDATE ON companies
        FOR EACH ROW
        EXECUTE FUNCTION companies_sync_audit_columns();
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
  // Drop trigger and function if present
  await knex.raw(`
    DROP TRIGGER IF EXISTS companies_sync_audit_columns_tr ON companies;
    DROP FUNCTION IF EXISTS companies_sync_audit_columns();
  `);

  // Drop camelCase columns if they exist
  const hasCreatedBy = await knex.schema.hasColumn("companies", "createdBy");
  const hasUpdatedBy = await knex.schema.hasColumn("companies", "updatedBy");

  if (hasCreatedBy || hasUpdatedBy) {
    await knex.schema.alterTable("companies", (table) => {
      if (hasCreatedBy) table.dropColumn("createdBy");
      if (hasUpdatedBy) table.dropColumn("updatedBy");
    });
  }
};
