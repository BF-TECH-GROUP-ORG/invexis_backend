/**
 * Migration for Companies and Related Tables
 * Includes: companies, company_departments, and event_outbox
 */

exports.up = async function (knex) {
    // 1. Create companies table
    await knex.schema.createTable("companies", (table) => {
        table.uuid("id").primary();
        table.string("name").notNullable();
        table.string("domain").nullable();
        table.string("email").nullable();

        table.string("phone").nullable();
        table.string("country").nullable();
        table.string("city").nullable();
        table.string("status").defaultTo("pending_verification");
        table.string("company_admin_id").nullable();
        table.jsonb("category_ids").defaultTo("[]");
        table.string("tier").defaultTo("Basic");
        table.jsonb("payment_profile").defaultTo(JSON.stringify({
            stripe: {
                connectAccountId: null,
                chargesEnabled: false,
                payoutsEnabled: false,
                currency: "RWF",
                paymentMethodId: null
            }
        }));
        table.jsonb("payment_phones").defaultTo("[]");
        table.boolean("is_bank").defaultTo(false);
        table.uuid("subscription_id").nullable();
        table.jsonb("compliance").defaultTo(JSON.stringify({ kycStatus: "pending", verifiedAt: null }));
        table.jsonb("metadata").defaultTo(JSON.stringify({ verification: { status: "pending", documents: [] } }));
        table.string("createdBy").nullable();
        table.string("updatedBy").nullable();
        table.boolean("isDeleted").defaultTo(false);
        table.timestamp("createdAt").defaultTo(knex.fn.now());
        table.timestamp("updatedAt").defaultTo(knex.fn.now());

        table.index("status", "idx_companies_status");
        table.index("tier", "idx_companies_tier");
        table.index(["status", "tier"], "idx_companies_status_tier");
        table.index("name", "idx_companies_name");
        table.index("company_admin_id", "idx_companies_company_admin_id");
    });

    // Partial unique index for domain
    await knex.schema.raw(`CREATE UNIQUE INDEX idx_companies_domain_unique ON companies(domain) WHERE domain IS NOT NULL`);

    // 2. Create company_departments table
    await knex.schema.createTable("company_departments", (table) => {
        table.uuid("id").primary();
        table.uuid("company_id").notNullable();
        table.string("name").notNullable();
        table.string("display_name").notNullable();
        table.text("description").nullable();
        table.string("status").defaultTo("active");
        table.string("createdBy").nullable();
        table.string("updatedBy").nullable();
        table.timestamp("createdAt").defaultTo(knex.fn.now());
        table.timestamp("updatedAt").defaultTo(knex.fn.now());

        table.foreign("company_id").references("companies.id").onDelete("CASCADE");
        table.index("company_id", "idx_departments_company_id");
        table.index(["company_id", "name"], "idx_company_dept_name");
        table.index(["status", "company_id"], "idx_departments_status_company");
    });

    // 3. Create event_outbox table
    await knex.schema.createTable("event_outbox", (table) => {
        table.uuid("id").primary();
        table.string("event_type").notNullable();
        table.string("exchange").notNullable();
        table.string("routing_key").notNullable();
        table.text("payload").notNullable();
        table.string("status").defaultTo("pending");
        table.integer("retries").defaultTo(0);
        table.timestamp("locked_at").nullable();
        table.timestamp("sent_at").nullable();
        table.timestamp("last_attempt_at").nullable();
        table.text("error_message").nullable();
        table.timestamp("created_at").defaultTo(knex.fn.now());

        table.index("status", "idx_outbox_status");
        table.index("created_at", "idx_outbox_created_at");
    });
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists("event_outbox");
    await knex.schema.dropTableIfExists("company_departments");
    await knex.schema.dropTableIfExists("companies");
};
