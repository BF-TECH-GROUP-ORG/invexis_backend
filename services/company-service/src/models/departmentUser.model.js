/**
 * DepartmentUser Model - Company Service
 * Explicitly links users to departments with company roles (seller, manager)
 * This is the single source of truth for user->company->department assignments
 */

const db = require("../config");
const { v4: uuidv4 } = require("uuid");

class DepartmentUser {
    static table = "department_users";

    constructor(data) {
        this.id = data.id || uuidv4();
        this.department_id = data.department_id; // Required - references company_departments
        this.company_id = data.company_id; // Required - for easy queries
        this.user_id = data.user_id; // Required - references auth users
        this.role = data.role; // Required - 'seller' or 'manager'
        this.status = data.status || "active"; // active | suspended
        this.assigned_by = data.assigned_by || null;
        this.assigned_at = new Date();
        this.updated_by = data.updated_by || null;
        this.updated_at = new Date();
    }

    /**
     * Assign a user to department with role
     */
    static async assign(data) {
        const record = new DepartmentUser(data);
        await db(this.table).insert(record);
        return record;
    }

    /**
     * Find all users in a department
     */
    static async findByDepartment(departmentId) {
        return db(this.table)
            .where({ department_id: departmentId })
            .select("*");
    }

    /**
     * Find all departments a user belongs to
     */
    static async findByUser(userId) {
        return db(this.table)
            .where({ user_id: userId })
            .select("*");
    }

    /**
     * Find all user departments in a company
     */
    static async findByUserAndCompany(userId, companyId) {
        return db(this.table)
            .where({ user_id: userId, company_id: companyId })
            .select("*");
    }

    /**
     * Find specific user in specific department
     */
    static async findByUserAndDepartment(userId, departmentId) {
        return db(this.table)
            .where({ user_id: userId, department_id: departmentId })
            .first();
    }

    /**
     * Update user's role in department
     */
    static async updateRole(userId, departmentId, role, actor) {
        await db(this.table)
            .where({ user_id: userId, department_id: departmentId })
            .update({
                role,
                updated_by: actor,
                updated_at: new Date(),
            });
        return this.findByUserAndDepartment(userId, departmentId);
    }

    /**
     * Suspend user in department
     */
    static async suspend(userId, departmentId, actor) {
        await db(this.table)
            .where({ user_id: userId, department_id: departmentId })
            .update({
                status: "suspended",
                updated_by: actor,
                updated_at: new Date(),
            });
        return this.findByUserAndDepartment(userId, departmentId);
    }

    /**
     * Reactivate user in department
     */
    static async reactivate(userId, departmentId, actor) {
        await db(this.table)
            .where({ user_id: userId, department_id: departmentId })
            .update({
                status: "active",
                updated_by: actor,
                updated_at: new Date(),
            });
        return this.findByUserAndDepartment(userId, departmentId);
    }

    /**
     * Remove user from department
     */
    static async remove(userId, departmentId) {
        await db(this.table)
            .where({ user_id: userId, department_id: departmentId })
            .del();
        return true;
    }

    /**
     * Remove user from all departments in company
     */
    static async removeFromCompany(userId, companyId) {
        await db(this.table)
            .where({ user_id: userId, company_id: companyId })
            .del();
        return true;
    }

    /**
     * Get user's departments as list
     * Returns array of department IDs for easy access
     */
    static async getUserDepartmentIds(userId, companyId) {
        const records = await db(this.table)
            .where({ user_id: userId, company_id: companyId, status: "active" })
            .select("department_id");
        return records.map((r) => r.department_id);
    }

    /**
     * Check if user is assigned to any department in company
     */
    static async hasAnyDepartment(userId, companyId) {
        const record = await db(this.table)
            .where({ user_id: userId, company_id: companyId, status: "active" })
            .first();
        return !!record;
    }

    /**
     * Get all active users in a department
     */
    static async getActivUsersByDepartment(departmentId) {
        return db(this.table)
            .where({ department_id: departmentId, status: "active" })
            .select("*");
    }

    /**
     * Count users in a department (all statuses)
     */
    static async countByDepartment(departmentId) {
        const result = await db(this.table)
            .where({ department_id: departmentId })
            .count("id as count")
            .first();
        return result?.count || 0;
    }

    /**
     * Count active users in a department
     */
    static async countActiveByDepartment(departmentId) {
        const result = await db(this.table)
            .where({ department_id: departmentId, status: "active" })
            .count("id as count")
            .first();
        return result?.count || 0;
    }

    /**
     * Count users with specific role in department
     */
    static async countByDepartmentAndRole(departmentId, role) {
        const result = await db(this.table)
            .where({ department_id: departmentId, role, status: "active" })
            .count("id as count")
            .first();
        return result?.count || 0;
    }
}

module.exports = DepartmentUser;
