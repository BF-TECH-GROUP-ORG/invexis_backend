const asyncHandler = require('express-async-handler');
const DepartmentUser = require('../models/departmentUser.model');
const Department = require('../models/department.model');
const Company = require('../models/company.model');
const User = require('../models/user.model');
const { departmentUserEvents } = require('../events/eventHelpers');
const db = require('../config');

/**
 * @desc    Assign user to department with company role (seller or manager)
 * @route   POST /api/department-users
 * @access  Private (Company Admin)
 * @body    { company_id, department_id, user_id, role }
 */
const assignUserToDepartment = asyncHandler(async (req, res) => {
    const { company_id, department_id, user_id, role } = req.body;

    // Validate required fields
    if (!company_id || !department_id || !user_id || !role) {
        res.status(400);
        throw new Error('Company ID, Department ID, User ID, and Role are required');
    }

    // Validate role (must be seller or manager)
    if (!['seller', 'manager'].includes(role)) {
        res.status(400);
        throw new Error('Role must be either "seller" or "manager"');
    }

    // Verify company exists
    const company = await Company.findCompanyById(company_id);
    if (!company) {
        res.status(404);
        throw new Error('Company not found');
    }

    // Verify department exists and belongs to company
    const department = await Department.findByIdAndCompany(department_id, company_id);
    if (!department) {
        res.status(404);
        throw new Error('Department not found in this company');
    }

    // Check if user is already in this department
    const existing = await DepartmentUser.findByUserAndDepartment(user_id, department_id);
    if (existing) {
        res.status(400);
        throw new Error('User is already assigned to this department');
    }

    // Use transaction to ensure atomicity
    return db.transaction(async (trx) => {
        // Assign user to department
        const assignment = await DepartmentUser.assign({
            company_id,
            department_id,
            user_id,
            role,
            assigned_by: req.user?.id || null,
        });

        // ✅ EMIT EVENT - User assigned to department
        await departmentUserEvents.assigned(
            user_id,
            department_id,
            company_id,
            role,
            trx
        );

        res.status(201).json({
            success: true,
            message: 'User assigned to department successfully',
            data: assignment,
        });
    });
});

/**
 * @desc    Get all users in a department with their roles
 * @route   GET /api/department-users/department/:departmentId
 * @access  Private
 */
const getUsersByDepartment = asyncHandler(async (req, res) => {
    const { departmentId } = req.params;

    // Verify department exists
    const department = await Department.findById(departmentId);
    if (!department) {
        res.status(404);
        throw new Error('Department not found');
    }

    const users = await DepartmentUser.findByDepartment(departmentId);

    res.json({
        success: true,
        count: users.length,
        data: users,
    });
});

/**
 * @desc    Get all departments a user belongs to
 * @route   GET /api/department-users/user/:userId
 * @access  Private
 */
const getDepartmentsByUser = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    const departments = await DepartmentUser.findByUser(userId);

    res.json({
        success: true,
        count: departments.length,
        data: departments,
    });
});

/**
 * @desc    Get user's departments within a specific company
 * @route   GET /api/department-users/user/:userId/company/:companyId
 * @access  Private
 */
const getUserDepartmentsByCompany = asyncHandler(async (req, res) => {
    const { userId, companyId } = req.params;

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    // Verify company exists
    const company = await Company.findCompanyById(companyId);
    if (!company) {
        res.status(404);
        throw new Error('Company not found');
    }

    const departments = await DepartmentUser.findByUserAndCompany(userId, companyId);

    res.json({
        success: true,
        count: departments.length,
        data: departments,
    });
});

/**
 * @desc    Get specific user-department assignment details
 * @route   GET /api/department-users/user/:userId/department/:departmentId
 * @access  Private
 */
const getUserDepartmentAssignment = asyncHandler(async (req, res) => {
    const { userId, departmentId } = req.params;

    const assignment = await DepartmentUser.findByUserAndDepartment(userId, departmentId);

    if (!assignment) {
        res.status(404);
        throw new Error('User-department assignment not found');
    }

    res.json({
        success: true,
        data: assignment,
    });
});

/**
 * @desc    Update user's role in department (seller <-> manager)
 * @route   PATCH /api/department-users/user/:userId/department/:departmentId/role
 * @access  Private (Company Admin)
 * @body    { role }
 */
const updateUserDepartmentRole = asyncHandler(async (req, res) => {
    const { userId, departmentId } = req.params;
    const { role } = req.body;

    if (!role) {
        res.status(400);
        throw new Error('Role is required');
    }

    if (!['seller', 'manager'].includes(role)) {
        res.status(400);
        throw new Error('Role must be either "seller" or "manager"');
    }

    // Verify assignment exists
    const assignment = await DepartmentUser.findByUserAndDepartment(userId, departmentId);
    if (!assignment) {
        res.status(404);
        throw new Error('User-department assignment not found');
    }

    if (assignment.role === role) {
        res.status(400);
        throw new Error('User already has this role');
    }

    // Use transaction for atomicity
    return db.transaction(async (trx) => {
        // Update role
        const updated = await DepartmentUser.updateRole(
            userId,
            departmentId,
            role,
            req.user?.id || null
        );

        // ✅ EMIT EVENT - User role changed in department
        await departmentUserEvents.roleChanged(
            userId,
            departmentId,
            assignment.company_id,
            role,
            trx
        );

        res.json({
            success: true,
            message: 'User role updated successfully',
            data: updated,
        });
    });
});

/**
 * @desc    Suspend user in department (blocks operations but keeps assignment)
 * @route   PATCH /api/department-users/user/:userId/department/:departmentId/suspend
 * @access  Private (Company Admin)
 */
const suspendUserFromDepartment = asyncHandler(async (req, res) => {
    const { userId, departmentId } = req.params;

    // Verify assignment exists
    const assignment = await DepartmentUser.findByUserAndDepartment(userId, departmentId);
    if (!assignment) {
        res.status(404);
        throw new Error('User-department assignment not found');
    }

    if (assignment.status === 'suspended') {
        res.status(400);
        throw new Error('User is already suspended in this department');
    }

    // Use transaction for atomicity
    return db.transaction(async (trx) => {
        // Suspend user
        const suspended = await DepartmentUser.suspend(
            userId,
            departmentId,
            req.user?.id || null
        );

        // ✅ EMIT EVENT - User suspended from department
        await departmentUserEvents.suspended(
            userId,
            departmentId,
            assignment.company_id,
            trx
        );

        res.json({
            success: true,
            message: 'User suspended from department successfully',
            data: suspended,
        });
    });
});

/**
 * @desc    Reactivate suspended user in department
 * @route   PATCH /api/department-users/user/:userId/department/:departmentId/reactivate
 * @access  Private (Company Admin)
 */
const reactivateUserInDepartment = asyncHandler(async (req, res) => {
    const { userId, departmentId } = req.params;

    // Verify assignment exists
    const assignment = await DepartmentUser.findByUserAndDepartment(userId, departmentId);
    if (!assignment) {
        res.status(404);
        throw new Error('User-department assignment not found');
    }

    if (assignment.status === 'active') {
        res.status(400);
        throw new Error('User is already active in this department');
    }

    // Use transaction for atomicity
    return db.transaction(async (trx) => {
        // Reactivate user
        const reactivated = await DepartmentUser.reactivate(
            userId,
            departmentId,
            req.user?.id || null
        );

        res.json({
            success: true,
            message: 'User reactivated in department successfully',
            data: reactivated,
        });
    });
});

/**
 * @desc    Remove user from department (delete assignment)
 * @route   DELETE /api/department-users/user/:userId/department/:departmentId
 * @access  Private (Company Admin)
 */
const removeUserFromDepartment = asyncHandler(async (req, res) => {
    const { userId, departmentId } = req.params;

    // Verify assignment exists
    const assignment = await DepartmentUser.findByUserAndDepartment(userId, departmentId);
    if (!assignment) {
        res.status(404);
        throw new Error('User-department assignment not found');
    }

    // Use transaction for atomicity
    return db.transaction(async (trx) => {
        // Remove user from department
        await DepartmentUser.remove(userId, departmentId);

        // ✅ EMIT EVENT - User removed from department
        await departmentUserEvents.removed(
            userId,
            departmentId,
            assignment.company_id,
            trx
        );

        res.json({
            success: true,
            message: 'User removed from department successfully',
        });
    });
});

/**
 * @desc    Remove user from all departments in company
 * @route   DELETE /api/department-users/user/:userId/company/:companyId
 * @access  Private (Company Admin)
 */
const removeUserFromCompanyDepartments = asyncHandler(async (req, res) => {
    const { userId, companyId } = req.params;

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    // Verify company exists
    const company = await Company.findCompanyById(companyId);
    if (!company) {
        res.status(404);
        throw new Error('Company not found');
    }

    // Get all department assignments before deleting
    const assignments = await DepartmentUser.findByUserAndCompany(userId, companyId);
    if (assignments.length === 0) {
        res.status(404);
        throw new Error('User has no department assignments in this company');
    }

    // Use transaction for atomicity
    return db.transaction(async (trx) => {
        // Remove user from all departments in company
        await DepartmentUser.removeFromCompany(userId, companyId);

        // ✅ EMIT EVENT - User removed from company (all departments)
        await departmentUserEvents.removedFromCompany(companyId, trx);

        res.json({
            success: true,
            message: `User removed from all departments in company successfully (${assignments.length} departments)`,
            data: {
                removed_count: assignments.length,
                departments: assignments.map(a => a.department_id),
            },
        });
    });
});

/**
 * @desc    Get all active users assigned to any department in a company
 * @route   GET /api/department-users/company/:companyId/active
 * @access  Private
 */
const getActiveUsersByCompany = asyncHandler(async (req, res) => {
    const { companyId } = req.params;

    // Verify company exists
    const company = await Company.findCompanyById(companyId);
    if (!company) {
        res.status(404);
        throw new Error('Company not found');
    }

    // Get all active department user assignments
    const assignments = await db('department_users')
        .where({ company_id: companyId, status: 'active' })
        .select('*');

    res.json({
        success: true,
        count: assignments.length,
        data: assignments,
    });
});

module.exports = {
    assignUserToDepartment,
    getUsersByDepartment,
    getDepartmentsByUser,
    getUserDepartmentsByCompany,
    getUserDepartmentAssignment,
    updateUserDepartmentRole,
    suspendUserFromDepartment,
    reactivateUserInDepartment,
    removeUserFromDepartment,
    removeUserFromCompanyDepartments,
    getActiveUsersByCompany,
};
