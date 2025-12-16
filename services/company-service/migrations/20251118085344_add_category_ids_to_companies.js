/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // 1. Idempotent ENUM creation (safe to run on every deploy)
  await knex.raw(`
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'company_tier') THEN
            CREATE TYPE company_tier AS ENUM ('Basic', 'Mid', 'Pro');
        END IF;
    END $$;
  `);

  // 2. Add only the field we actually need
  await knex.schema.alterTable("companies", (table) => {
    // Array of Level-1 category IDs from Inventory service (MongoDB ObjectIds or UUIDs as text)
    table.specificType("category_ids", "text[]")
         .defaultTo(knex.raw("'{}'::text[]"))
         .comment("Array of top-level (Level 1) category IDs from Inventory service");

    // GIN index for fast queries like: WHERE category_ids @> ARRAY['507f1f77bcf86cd799439011']
    table.index("category_ids", "idx_companies_category_ids", "GIN");
  });

  // Optional: helpful comment for future developers
  await knex.raw(`
    COMMENT ON COLUMN companies.category_ids 
    IS 'Level-1 category IDs (MongoDB) that the company specializes in. Used for filtering and recommendations.';
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.alterTable("companies", (table) => {
    table.dropIndex("category_ids", "idx_companies_category_ids");
    table.dropColumn("category_ids");
  });

  // We don't drop the ENUM — other tables or future migrations may still need it
  // Only drop if you're 100% sure nothing else uses it:
  // await knex.raw("DROP TYPE IF EXISTS company_tier CASCADE");
};