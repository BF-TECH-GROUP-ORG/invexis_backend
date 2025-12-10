const asyncHandler = require('express-async-handler');
const CompanyUser = require('../models/companyUser.model');
const Company = require('../models/company.model');
const Role = require('../models/role.model');
const { departmentUserEvents } = require('../events/eventHelpers');
const db = require('../config');

/**
 * @desc    Assign user to company with role
 * @route   POST /api/company-users
 * @access  Private (Company Admin)
 * @deprecated This endpoint maintains backward compatibility but uses event-driven architecture
 * @note    For new implementations, use POST /api/department-users instead
 */
const assignUserToCompany = asyncHandler(async (req, res) => {
  const { company_id, user_id, role_id } = req.body;

  // Validate required fields
  if (!company_id || !user_id || !role_id) {
    res.status(400);
    throw new Error('Company ID, User ID, and Role ID are required');
  }

  // Check if company exists
  const company = await Company.findCompanyById(company_id);
  if (!company) {
    res.status(404);
    throw new Error('Company not found');
  }

  // Check if role exists
  const role = await Role.findById(role_id);
  if (!role) {
    res.status(404);
    throw new Error('Role not found');
  }

  // Check if user is already assigned to this company
  const existing = await CompanyUser.findByUserAndCompany(user_id, company_id);
  if (existing) {
    res.status(400);
    throw new Error('User is already assigned to this company');
  }

  // Use transaction to ensure atomicity
  return db.transaction(async (trx) => {
    // Assign user to company (backward compatibility)
    const companyUser = await CompanyUser.assign({
      company_id,
      user_id,
      role_id,
      createdBy: req.user?.id || null,
    });

    // ✅ EMIT EVENT - User assigned to company
    await departmentUserEvents.assigned(
      user_id,
      null, // No specific department for backward compat
      company_id,
      role.name || 'worker',
      trx
    );

    res.status(201).json({
      success: true,
      data: companyUser,
    });
  });
});

/**
 * @desc    Get all users in a company with full details
 * @route   GET /api/company-users/company/:companyId
 * @access  Private
 * @note    Fetches from Auth Service (source of truth)
 */
const getUsersByCompany = asyncHandler(async (req, res) => {
  const { companyId } = req.params;

  try {
    // Fetch directly from Auth Service - it's the source of truth for users
    const axios = require('axios');
    const authResponse = await axios.get(
      `${process.env.AUTH_SERVICE_URL || 'http://auth-service:8001'}/users/company/${companyId}`,
      {
        params: {
          includeCompanies: true,
          limit: 1000,
        },
      }
    );

    const users = authResponse.data?.data || [];

    res.json({
      success: true,
      count: users.length,
      data: users.map(user => ({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        companies: user.companies || [],
        assignedDepartments: user.assignedDepartments || [],
        employmentStatus: user.employmentStatus,
      })),
    });
  } catch (error) {
    res.status(400);
    throw new Error(`Cannot fetch company users: ${error.message}`);
  }
});

/**
 * @desc    Get all companies a user belongs to
 * @route   GET /api/company-users/user/:userId
 * @access  Private
 */
const getCompaniesByUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const companies = await CompanyUser.findByUser(userId);

  res.json({
    success: true,
    count: companies.length,
    data: companies,
  });
});

/**
 * @desc    Get specific user-company relationship
 * @route   GET /api/company-users/company/:companyId/user/:userId
 * @access  Private
 */
const getUserCompanyRelation = asyncHandler(async (req, res) => {
  const { companyId, userId } = req.params;

  const relation = await CompanyUser.findByUserAndCompany(userId, companyId);

  if (!relation) {
    res.status(404);
    throw new Error('User-company relationship not found');
  }

  res.json({
    success: true,
    data: relation,
  });
});

/**
 * @desc    Update user role in company
 * @route   PATCH /api/company-users/company/:companyId/user/:userId/role
 * @access  Private (Company Admin)
 */
const updateUserRole = asyncHandler(async (req, res) => {
  const { companyId, userId } = req.params;
  const { role_id } = req.body;

  if (!role_id) {
    res.status(400);
    throw new Error('Role ID is required');
  }

  // Check if relationship exists
  const relation = await CompanyUser.findByUserAndCompany(userId, companyId);
  if (!relation) {
    res.status(404);
    throw new Error('User-company relationship not found');
  }

  // Check if role exists
  const role = await Role.findById(role_id);
  if (!role) {
    res.status(404);
    throw new Error('Role not found');
  }

  // Use transaction for atomicity
  return db.transaction(async (trx) => {
    // Update role
    const updated = await CompanyUser.updateRole(
      companyId,
      userId,
      role_id,
      req.user?.id || null
    );

    // ✅ EMIT EVENT - User role changed
    await departmentUserEvents.roleChanged(
      userId,
      null, // No specific department
      companyId,
      role.name || 'worker',
      trx
    );

    res.json({
      success: true,
      data: updated,
    });
  });
});

/**
 * @desc    Suspend user in company
 * @route   PATCH /api/company-users/company/:companyId/user/:userId/suspend
 * @access  Private (Company Admin)
 */
const suspendUser = asyncHandler(async (req, res) => {
  const { companyId, userId } = req.params;

  // Check if relationship exists
  const relation = await CompanyUser.findByUserAndCompany(userId, companyId);
  if (!relation) {
    res.status(404);
    throw new Error('User-company relationship not found');
  }

  // Use transaction for atomicity
  return db.transaction(async (trx) => {
    // Suspend user
    const suspended = await CompanyUser.suspend(
      companyId,
      userId,
      req.user?.id
    );

    // ✅ EMIT EVENT - User suspended
    await departmentUserEvents.suspended(
      userId,
      null, // No specific department
      companyId,
      trx
    );

    res.json({
      success: true,
      data: suspended,
    });
  });
});

/**
 * @desc    Remove user from company
 * @route   DELETE /api/company-users/company/:companyId/user/:userId
 * @access  Private (Company Admin)
 */
const removeUserFromCompany = asyncHandler(async (req, res) => {
  const { companyId, userId } = req.params;

  // Check if relationship exists
  const relation = await CompanyUser.findByUserAndCompany(userId, companyId);
  if (!relation) {
    res.status(404);
    throw new Error('User-company relationship not found');
  }

  // Use transaction for atomicity
  return db.transaction(async (trx) => {
    // Remove user
    await CompanyUser.remove(companyId, userId);

    // ✅ EMIT EVENT - User removed from company
    await departmentUserEvents.removed(
      userId,
      null, // No specific department
      companyId,
      trx
    );

    res.json({
      success: true,
      message: 'User removed from company successfully',
    });
  });
});

const suspendAllUsersFromCompany = asyncHandler(async (req, res) => {
  const { companyId } = req.params;
  const users = await CompanyUser.findByCompany(companyId);

  // Use transaction for atomicity
  return db.transaction(async (trx) => {
    for (const user of users) {
      await CompanyUser.suspend(companyId, user.user_id, req.user?.id);
      // ✅ EMIT EVENT for each user suspended
      await departmentUserEvents.suspended(
        user.user_id,
        null,
        companyId,
        trx
      );
    }

    res.json({
      success: true,
      message: 'All users suspended from company successfully',
    });
  });
});

module.exports = {
  assignUserToCompany,
  getUsersByCompany,
  getCompaniesByUser,
  getUserCompanyRelation,
  updateUserRole,
  suspendUser,
  removeUserFromCompany,
  suspendAllUsersFromCompany
};

