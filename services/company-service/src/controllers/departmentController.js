/**
 * Department Controller - Company Service
 * Handles department CRUD operations for companies
 */

const Department = require("../models/department.model");
const Company = require("../models/company.model");
const { DEPARTMENTS } = require("../constants/departments");
const { getCache, setCache, delCache } = require('../utils/redisHelper');

/**
 * Get all departments for a company
 * GET /company/departments?companyId=<id>
 * GET /company/companies/:companyId/departments
 */
const getDepartmentsByCompany = async (req, res) => {
    try {
        const companyId = req.params.companyId || req.query.companyId || req.body.companyId;

        if (!companyId) {
            return res.status(400).json({
                ok: false,
                message: "companyId is required"
            });
        }

        // Try cache first
        const cacheKey = `departments:${companyId}`;
        try {
            const cachedDepts = await getCache(cacheKey);
            if (cachedDepts) {
                console.log(`[CACHE HIT] Departments for company ${companyId}`);
                return res.status(200).json({
                    ok: true,
                    data: cachedDepts,
                    total: cachedDepts.length
                });
            }
        } catch (e) {
            console.warn('Redis get failed (non-blocking):', e && e.message);
        }

        // Verify company exists
        const company = await Company.findCompanyById(companyId);
        if (!company) {
            return res.status(404).json({
                ok: false,
                message: "Company not found"
            });
        }

        // Get all departments for this company
        const departments = await Department.findByCompany(companyId);

        // Enrich with user counts (Set to 0 as DepartmentUser model is removed)
        const enrichedDepartments = departments.map(dept => ({
            ...dept,
            activeUserCount: 0
        }));

        // Cache the result (fire-and-forget, 5min TTL)
        setCache(cacheKey, enrichedDepartments, 300).catch(() => { });

        res.status(200).json({
            ok: true,
            data: enrichedDepartments,
            total: enrichedDepartments.length
        });
    } catch (error) {
        console.error("Error fetching departments:", error);
        res.status(500).json({
            ok: false,
            message: "Failed to fetch departments",
            error: error.message
        });
    }
};

/**
 * Get single department details
 * GET /company/departments/:departmentId
 */
const getDepartmentById = async (req, res) => {
    try {
        const { departmentId } = req.params;
        const { companyId } = req.query;

        // Create cache key
        const cacheKey = companyId ? `department:${departmentId}:${companyId}` : `department:${departmentId}`;

        if (!departmentId) {
            return res.status(400).json({
                ok: false,
                message: "departmentId is required"
            });
        }

        // Try cache first
        try {
            const cachedDept = await getCache(cacheKey);
            if (cachedDept) {
                console.log(`[CACHE HIT] Department ${departmentId}`);
                return res.status(200).json({
                    ok: true,
                    data: cachedDept
                });
            }
        } catch (e) {
            console.warn('Redis get failed (non-blocking):', e && e.message);
        }

        let department;

        if (companyId) {
            // Verify department belongs to company
            department = await Department.findByIdAndCompany(departmentId, companyId);
            if (!department) {
                return res.status(404).json({
                    ok: false,
                    message: "Department not found in this company"
                });
            }
        } else {
            department = await Department.findById(departmentId);
            if (!department) {
                return res.status(404).json({
                    ok: false,
                    message: "Department not found"
                });
            }
        }

        // Cache the result (fire-and-forget, 5min TTL)
        setCache(cacheKey, department, 300).catch(() => { });

        res.status(200).json({
            ok: true,
            data: {
                ...department,
                activeUserCount: 0,
                totalUserCount: 0
            }
        });
    } catch (error) {
        console.error("Error fetching department:", error);
        res.status(500).json({
            ok: false,
            message: "Failed to fetch department",
            error: error.message
        });
    }
};

/**
 * Update department details (description, display_name)
 * PUT /company/departments/:departmentId
 */
const updateDepartment = async (req, res) => {
    try {
        const { departmentId } = req.params;
        const { companyId, description, display_name, updatedBy } = req.body;

        if (!departmentId || !companyId) {
            return res.status(400).json({
                ok: false,
                message: "departmentId and companyId are required"
            });
        }

        // Verify department belongs to company
        const department = await Department.findByIdAndCompany(departmentId, companyId);
        if (!department) {
            return res.status(404).json({
                ok: false,
                message: "Department not found in this company"
            });
        }

        // Update only allowed fields
        const updateData = {
            updatedBy: updatedBy || "system"
        };

        if (description !== undefined) {
            updateData.description = description;
        }

        if (display_name !== undefined) {
            updateData.display_name = display_name;
        }

        const updatedDept = await Department.update(departmentId, updateData);

        res.status(200).json({
            ok: true,
            message: "Department updated successfully",
            data: updatedDept
        });
    } catch (error) {
        console.error("Error updating department:", error);
        res.status(500).json({
            ok: false,
            message: "Failed to update department",
            error: error.message
        });
    }
};

/**
 * Change department status (active/inactive)
 * PATCH /company/departments/:departmentId/status
 */
const changeDepartmentStatus = async (req, res) => {
    try {
        const { departmentId } = req.params;
        const { companyId, status, updatedBy } = req.body;

        if (!departmentId || !companyId) {
            return res.status(400).json({
                ok: false,
                message: "departmentId and companyId are required"
            });
        }

        if (!status || !["active", "inactive"].includes(status)) {
            return res.status(400).json({
                ok: false,
                message: "status must be 'active' or 'inactive'"
            });
        }

        // Verify department belongs to company
        const department = await Department.findByIdAndCompany(departmentId, companyId);
        if (!department) {
            return res.status(404).json({
                ok: false,
                message: "Department not found in this company"
            });
        }

        // Update status
        const updatedDept = await Department.update(departmentId, {
            status,
            updatedBy: updatedBy || "system"
        });

        res.status(200).json({
            ok: true,
            message: `Department status changed to ${status}`,
            data: updatedDept
        });
    } catch (error) {
        console.error("Error updating department status:", error);
        res.status(500).json({
            ok: false,
            message: "Failed to update department status",
            error: error.message
        });
    }
};

/**
 * Get department statistics
 * GET /company/departments/:departmentId/stats
 */
const getDepartmentStats = async (req, res) => {
    try {
        const { departmentId } = req.params;
        const { companyId } = req.query;

        if (!departmentId) {
            return res.status(400).json({
                ok: false,
                message: "departmentId is required"
            });
        }

        // Verify department exists
        const department = await Department.findById(departmentId);
        if (!department) {
            return res.status(404).json({
                ok: false,
                message: "Department not found"
            });
        }

        // If companyId provided, verify department belongs to company
        if (companyId && department.company_id !== companyId) {
            return res.status(403).json({
                ok: false,
                message: "Department does not belong to this company"
            });
        }

        res.status(200).json({
            ok: true,
            data: {
                departmentId,
                activeUserCount: 0,
                totalUserCount: 0,
                managerCount: 0,
                sellerCount: 0,
                status: department.status
            }
        });
    } catch (error) {
        console.error("Error fetching department stats:", error);
        res.status(500).json({
            ok: false,
            message: "Failed to fetch department stats",
            error: error.message
        });
    }
};

/**
 * List all departments across all companies (Admin only)
 * GET /company/departments/all
 */
const getAllDepartments = async (req, res) => {
    try {
        const { status, companyId } = req.query;
        const db = require("../config");

        let query = db(Department.table);

        if (status) {
            query = query.where({ status });
        }

        if (companyId) {
            query = query.where({ company_id: companyId });
        }

        const departments = await query.orderBy("company_id").orderBy("name");

        res.status(200).json({
            ok: true,
            data: departments,
            total: departments.length
        });
    } catch (error) {
        console.error("Error fetching all departments:", error);
        res.status(500).json({
            ok: false,
            message: "Failed to fetch departments",
            error: error.message
        });
    }
};

module.exports = {
    getDepartmentsByCompany,
    getDepartmentById,
    updateDepartment,
    changeDepartmentStatus,
    getDepartmentStats,
    getAllDepartments
};

