/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema
        .alterTable("company_departments", (table) => {
            // Change audit columns from UUID to String to support MongoDB ObjectIds
            table.string("createdBy").alter();
            table.string("updatedBy").alter();
        })
        .alterTable("department_users", (table) => {
            // Change user-related columns from UUID to String
            table.string("user_id").alter();
            table.string("assigned_by").alter();
            table.string("updated_by").alter();
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema
        .alterTable("company_departments", (table) => {
            // Revert back to UUID
            table.uuid("createdBy").alter();
            table.uuid("updatedBy").alter();
        })
        .alterTable("department_users", (table) => {
            // Revert back to UUID
            table.uuid("user_id").alter();
            table.uuid("assigned_by").alter();
            table.uuid("updated_by").alter();
        });
};
