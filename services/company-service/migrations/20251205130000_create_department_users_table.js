/**
 * Migration: Create department_users table
 */

exports.up = function (knex) {
    return knex.schema.createTable("department_users", (table) => {
        table.uuid("id").primary();
        table.uuid("department_id").notNullable();
        table.uuid("company_id").notNullable();
        table.uuid("user_id").notNullable(); // String UUID from auth service
        table.string("role").notNullable(); // 'seller' or 'manager'
        table.string("status").defaultTo("active"); // active | suspended
        table.uuid("assigned_by").nullable();
        table.timestamp("assigned_at").defaultTo(knex.fn.now());
        table.uuid("updated_by").nullable();
        table.timestamp("updated_at").defaultTo(knex.fn.now());

        // Indexes
        table.index(["department_id"]);
        table.index(["user_id"]);
        table.index(["company_id"]);
        table.index(["company_id", "user_id"], "idx_company_user");
        table.index(["department_id", "user_id"], "idx_dept_user");

        // Foreign key
        table.foreign("department_id").references("company_departments.id").onDelete("CASCADE");
        table.foreign("company_id").references("companies.id").onDelete("CASCADE");
    });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists("department_users");
};
