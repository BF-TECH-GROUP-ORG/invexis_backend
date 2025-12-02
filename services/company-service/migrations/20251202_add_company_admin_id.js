/**
 * Migration: Add company_admin_id to companies table
 * Changes from shop_admin_id to company_admin_id for proper company admin management
 */

exports.up = function (knex) {
    return knex.schema.table("companies", (table) => {
        // Add company_admin_id column
        table.uuid("company_admin_id").nullable().after("tenant_id");

        // Add index for faster lookups
        table.index(["company_admin_id"], "idx_company_admin_id");
    });
};

exports.down = function (knex) {
    return knex.schema.table("companies", (table) => {
        table.dropIndex(["company_admin_id"], "idx_company_admin_id");
        table.dropColumn("company_admin_id");
    });
};
