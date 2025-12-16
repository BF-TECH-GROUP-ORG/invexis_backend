const asyncHandler = require('express-async-handler');
const Role = require('../models/role.model');
const { publishRoleEvent } = require('../events/producer');

/**
 * @desc    Create a new role
 * @route   POST /api/roles
 * @access  Private (Company Admin)
 */
const createRole = asyncHandler(async (req, res) => {
  const { company_id, name, permissions } = req.body;

  // Validate required fields
  if (!company_id || !name) {
    res.status(400);
    throw new Error('Company ID and role name are required');
  }

  // Check if role already exists
  const exists = await Role.exists(company_id, name);
  if (exists) {
    res.status(400);
    throw new Error('Role with this name already exists in the company');
  }

  // Create role
  const role = await Role.create({
    company_id,
    name,
    permissions: permissions || [],
    createdBy: req.user?.id || null,
  });

  // Publish event
  await publishRoleEvent.created(role);

  res.status(201).json({
    success: true,
    data: role,
  });
});

/**
 * @desc    Get all roles for a company
 * @route   GET /api/roles/company/:companyId
 * @access  Private
 */
const getRolesByCompany = asyncHandler(async (req, res) => {
  const { companyId } = req.params;

  const roles = await Role.findByCompany(companyId);

  res.json({
    success: true,
    count: roles.length,
    data: roles,
  });
});

/**
 * @desc    Get role by ID
 * @route   GET /api/roles/:id
 * @access  Private
 */
const getRoleById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const role = await Role.findById(id);

  if (!role) {
    res.status(404);
    throw new Error('Role not found');
  }

  res.json({
    success: true,
    data: role,
  });
});

/**
 * @desc    Get role by name within a company
 * @route   GET /api/roles/company/:companyId/name/:name
 * @access  Private
 */
const getRoleByName = asyncHandler(async (req, res) => {
  const { companyId, name } = req.params;

  const role = await Role.findByName(companyId, name);

  if (!role) {
    res.status(404);
    throw new Error('Role not found');
  }

  res.json({
    success: true,
    data: role,
  });
});

/**
 * @desc    Update role
 * @route   PUT /api/roles/:id
 * @access  Private (Company Admin)
 */
const updateRole = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, permissions } = req.body;

  const role = await Role.findById(id);
  if (!role) {
    res.status(404);
    throw new Error('Role not found');
  }

  const updateData = {
    ...(name && { name }),
    ...(permissions && { permissions }),
    updatedBy: req.user?.id || null,
  };

  const updatedRole = await Role.update(id, updateData);

  // Publish event
  await publishRoleEvent.updated(updatedRole);

  res.json({
    success: true,
    data: updatedRole,
  });
});

/**
 * @desc    Delete role
 * @route   DELETE /api/roles/:id
 * @access  Private (Company Admin)
 */
const deleteRole = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const role = await Role.findById(id);
  if (!role) {
    res.status(404);
    throw new Error('Role not found');
  }

  await Role.delete(id);

  // Publish event
  await publishRoleEvent.deleted(id);

  res.json({
    success: true,
    message: 'Role deleted successfully',
  });
});

/**
 * @desc    Add permission to role
 * @route   POST /api/roles/:id/permissions
 * @access  Private (Company Admin)
 */
const addPermission = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { permission } = req.body;

  if (!permission) {
    res.status(400);
    throw new Error('Permission is required');
  }

  const role = await Role.findById(id);
  if (!role) {
    res.status(404);
    throw new Error('Role not found');
  }

  const updatedRole = await Role.addPermission(id, permission);

  // Publish event
  await publishRoleEvent.permissionAdded(id, permission);

  res.json({
    success: true,
    data: updatedRole,
  });
});

/**
 * @desc    Remove permission from role
 * @route   DELETE /api/roles/:id/permissions
 * @access  Private (Company Admin)
 */
const removePermission = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { permission } = req.body;

  if (!permission) {
    res.status(400);
    throw new Error('Permission is required');
  }

  const role = await Role.findById(id);
  if (!role) {
    res.status(404);
    throw new Error('Role not found');
  }

  const updatedRole = await Role.removePermission(id, permission);

  // Publish event
  await publishRoleEvent.permissionRemoved(id, permission);

  res.json({
    success: true,
    data: updatedRole,
  });
});

module.exports = {
  createRole,
  getRolesByCompany,
  getRoleById,
  getRoleByName,
  updateRole,
  deleteRole,
  addPermission,
  removePermission,
};

