/**
 * Migration: Create company_departments table
 */

exports.up = function (knex) {
    return knex.schema.createTable("company_departments", (table) => {
        table.uuid("id").primary();
        table.uuid("company_id").notNullable();
        table.string("name").notNullable(); // 'sales' or 'management'
        table.string("display_name").notNullable(); // 'Sales' or 'Management'
        table.text("description").nullable();
        table.string("status").defaultTo("active"); // active | inactive
        table.uuid("createdBy").nullable();
        table.uuid("updatedBy").nullable();
        table.timestamp("createdAt").defaultTo(knex.fn.now());
        table.timestamp("updatedAt").defaultTo(knex.fn.now());

        // Indexes
        table.index(["company_id"]);
        table.index(["company_id", "name"], "idx_company_dept_name");

        // Foreign key
        table.foreign("company_id").references("companies.id").onDelete("CASCADE");
    });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists("company_departments");
};
