/**
 * Department Model - Company Service
 * Fixed departments: SALES and MANAGEMENT
 * Each company has exactly these two departments
 */

const db = require("../config");
const { v4: uuidv4 } = require("uuid");

class Department {
    static table = "company_departments";

    constructor(data) {
        this.id = data.id || uuidv4();
        this.company_id = data.company_id; // Required
        this.name = data.name; // 'sales' or 'management'
        this.display_name = data.display_name; // 'Sales' or 'Management'
        this.description = data.description || null;
        this.status = data.status || "active"; // active | inactive
        this.createdBy = data.createdBy || null;
        this.updatedBy = data.updatedBy || null;
        this.createdAt = new Date();
        this.updatedAt = new Date();
    }

    /**
     * Create a department
     */
    static async create(data) {
        const department = new Department(data);
        await db(this.table).insert(department);
        return department;
    }

    /**
     * Find department by ID
     */
    static async findById(id) {
        return db(this.table).where({ id }).first();
    }

    /**
     * Find department by ID and verify it belongs to company
     */
    static async findByIdAndCompany(id, companyId) {
        return db(this.table)
            .where({ id, company_id: companyId })
            .first();
    }

    /**
     * Find department by company and name
     */
    static async findByCompanyAndName(companyId, name) {
        return db(this.table)
            .where({ company_id: companyId, name })
            .first();
    }

    /**
     * Find all departments for a company
     */
    static async findByCompany(companyId) {
        return db(this.table).where({ company_id: companyId });
    }

    /**
     * Update department
     */
    static async update(id, data) {
        const updateData = {
            ...data,
            updatedAt: new Date(),
        };
        await db(this.table).where({ id }).update(updateData);
        return this.findById(id);
    }

    /**
     * Check if department exists
     */
    static async exists(companyId, name) {
        const dept = await db(this.table)
            .where({ company_id: companyId, name })
            .first();
        return !!dept;
    }

    /**
     * Get all active departments for company
     */
    static async findActiveByCompany(companyId) {
        return db(this.table)
            .where({ company_id: companyId, status: "active" });
    }
}

module.exports = Department;
