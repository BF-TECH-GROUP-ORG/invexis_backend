/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // 1. Create ENUM type
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'company_tier') THEN
        CREATE TYPE company_tier AS ENUM ('Basic', 'Mid', 'Pro');
      END IF;
    END$$;
  `);

  // 2. Create table
  return knex.schema.createTable("companies", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("tenant_id").notNullable().unique().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("name").notNullable();
    table.string("domain").unique();
    table.string("email");
    table.string("phone");
    table.text("address");
    table.string("city");
    table.string("state");
    table.string("country");
    table.string("postal_code");
    table.jsonb("coordinates");
    table.string("timezone").defaultTo("UTC");
    table.string("currency").defaultTo("USD");
    table.string("status").defaultTo("active");
    table
      .specificType("tier", "company_tier")
      .defaultTo("Basic");
    table.timestamp("tier_start_date");
    table.timestamp("tier_end_date");
    table.string("shop_admin_id");
    table.specificType("location", "GEOGRAPHY(POINT, 4326)");
    table.boolean("is_deleted").defaultTo(false);
    table.timestamp("deleted_at");
    table.string("created_by");
    table.string("updated_by");
    table.string("deleted_by");
    table.bigInteger("version").defaultTo(1);

    table.time("open_time").defaultTo("08:00");
    table.time("close_time").defaultTo("21:00");
    table.boolean("enforce_operating_hours").defaultTo(true);

    table.jsonb("notification_preferences").defaultTo(
      JSON.stringify({ email: true, sms: false, inApp: true })
    );

    table.jsonb("metadata").defaultTo("{}");
    table.jsonb("feature_flags").defaultTo("{}");
    table.integer("service_radius_meters").defaultTo(0);
    table.string("access_level").defaultTo("private");

    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  // Drop the table
  await knex.schema.dropTableIfExists("companies");

  // Drop ENUM type
  await knex.raw("DROP TYPE IF EXISTS company_tier");
};
