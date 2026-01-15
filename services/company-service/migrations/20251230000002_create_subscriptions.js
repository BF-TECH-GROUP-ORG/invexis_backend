/**
 * Migration for Subscriptions
 */

exports.up = async function (knex) {
    await knex.schema.createTable("subscriptions", (table) => {
        table.uuid("id").primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid("company_id").notNullable();
        table.string("tier").defaultTo("basic");
        table.timestamp("start_date").defaultTo(knex.fn.now());
        table.timestamp("end_date").nullable();
        table.boolean("is_active").defaultTo(true);
        table.decimal("amount", 15, 2).defaultTo(0);
        table.string("currency").defaultTo("XAF");

        // Advanced Billing Fields (Moved from Payment Service)
        table.boolean("auto_renew").defaultTo(false);
        table.jsonb("payment_priority").defaultTo('["MTN", "CARD"]');
        table.string("stripe_payment_method_id").nullable();
        table.string("momo_phone_number").nullable();
        table.string("last_billing_status").nullable();
        table.timestamp("last_billing_attempt").nullable();

        table.string("payment_reference").nullable();
        table.jsonb("metadata").defaultTo("{}");
        table.timestamp("createdAt").defaultTo(knex.fn.now());
        table.timestamp("updatedAt").defaultTo(knex.fn.now());

        table.foreign("company_id").references("companies.id").onDelete("CASCADE");
        table.index("company_id", "idx_subscriptions_company_id");
        table.index("is_active", "idx_subscriptions_is_active");
        table.index(["company_id", "is_active"], "idx_subscriptions_company_active");
        table.index("end_date", "idx_subscriptions_end_date");
    });
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists("subscriptions");
};
