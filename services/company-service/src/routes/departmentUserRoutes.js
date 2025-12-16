const express = require('express');
const {
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
} = require('../controllers/departmentUserController');

const router = express.Router();

// Assign user to department
router.post('/', assignUserToDepartment);

// Get all users in a department
router.get('/department/:departmentId', getUsersByDepartment);

// Get all departments a user belongs to
router.get('/user/:userId', getDepartmentsByUser);

// Get user's departments in specific company
router.get('/user/:userId/company/:companyId', getUserDepartmentsByCompany);

// Get specific user-department assignment
router.get('/user/:userId/department/:departmentId', getUserDepartmentAssignment);

// Update user's role in department (seller <-> manager)
router.patch('/user/:userId/department/:departmentId/role', updateUserDepartmentRole);

// Suspend user in department
router.patch('/user/:userId/department/:departmentId/suspend', suspendUserFromDepartment);

// Reactivate user in department
router.patch('/user/:userId/department/:departmentId/reactivate', reactivateUserInDepartment);

// Remove user from department
router.delete('/user/:userId/department/:departmentId', removeUserFromDepartment);

// Remove user from all departments in company
router.delete('/user/:userId/company/:companyId', removeUserFromCompanyDepartments);

// Get all active users in company
router.get('/company/:companyId/active', getActiveUsersByCompany);

module.exports = router;
