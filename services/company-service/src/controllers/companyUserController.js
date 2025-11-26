const asyncHandler = require('express-async-handler');
const CompanyUser = require('../models/companyUser.model');
const Company = require('../models/company.model');
const Role = require('../models/role.model');
const User = require('../models/user.model');
const { publishCompanyUserEvent } = require('../events/producer');

/**
 * @desc    Assign user to company with role
 * @route   POST /api/company-users
 * @access  Private (Company Admin)
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

  // Assign user to company
  const companyUser = await CompanyUser.assign({
    company_id,
    user_id,
    role_id,
    createdBy: req.user?.id || null,
  });

  // Publish event
  await publishCompanyUserEvent.assigned(companyUser);

  res.status(201).json({
    success: true,
    data: companyUser,
  });
});

/**
 * @desc    Get all users in a company with full details
 * @route   GET /api/company-users/company/:companyId
 * @access  Private
 */
const getUsersByCompany = asyncHandler(async (req, res) => {
  const { companyId } = req.params;

  // Use User model which JOINs with company_role_assignments and users table
  const users = await User.getByCompany(companyId);

  res.json({
    success: true,
    count: users.length,
    data: users,
  });
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

  // Update role
  const updated = await CompanyUser.updateRole(
    companyId,
    userId,
    role_id,
    req.user?.id || null
  );

  // Publish event
  await publishCompanyUserEvent.roleChanged(updated);

  res.json({
    success: true,
    data: updated,
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

  // Suspend user
  const suspended = await CompanyUser.suspend(
    companyId,
    userId,
    req.user?.id
  );

  // Publish event
  await publishCompanyUserEvent.suspended(companyId, userId);

  res.json({
    success: true,
    data: suspended,
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

  // Remove user
  await CompanyUser.remove(companyId, userId);

  // Publish event
  await publishCompanyUserEvent.removed(companyId, userId);

  res.json({
    success: true,
    message: 'User removed from company successfully',
  });
});

const suspendAllUsersFromCompany = asyncHandler(async (req, res) => {
  const { companyId } = req.params;
  const users = await CompanyUser.findByCompany(companyId);
  for (const user of users) {
    await CompanyUser.suspend(companyId, user.user_id, req.user?.id);
  }
  await publishCompanyUserEvent.allSuspended(companyId);
  res.json({
    success: true,
    message: 'All users suspended from company successfully',
  });
})

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

