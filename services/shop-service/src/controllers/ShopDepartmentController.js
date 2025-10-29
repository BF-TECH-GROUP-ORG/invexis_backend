"use strict";

const asyncHandler = require("express-async-handler");
const { Shop, ShopDepartment } = require("../models/index.model");
const { departmentEvents } = require("../events/eventHelpers");
const db = require("../config/db");

/**
 * @desc    Create a new department
 * @route   POST /api/shops/:shopId/departments
 * @access  Private (Company Admin)
 */
const createDepartment = asyncHandler(async (req, res) => {
  const { shopId } = req.params;
  const { name, description, capacity } = req.body;

  // Validate shop exists
  const shop = await Shop.findById(shopId);
  if (!shop) {
    res.status(404);
    throw new Error("Shop not found");
  }

  // Verify company ownership
  const companyId = req.user?.companyId || req.body.companyId;
  if (shop.company_id !== companyId) {
    res.status(403);
    throw new Error("Unauthorized: Shop does not belong to your company");
  }

  // Validate required fields
  if (!name) {
    res.status(400);
    throw new Error("Department name is required");
  }

  // Check if department name is unique within shop
  const isUnique = await ShopDepartment.isNameUnique(shopId, name);
  if (!isUnique) {
    res.status(409);
    throw new Error("Department name already exists in this shop");
  }

  // Create department with transaction
  const department = await db.transaction(async (trx) => {
    const newDept = await ShopDepartment.create(
      {
        shop_id: shopId,
        name,
        description: description || null,
        capacity: capacity || 0,
        created_by: req.user?.id || null,
      },
      trx
    );

    // Create outbox event
    await departmentEvents.created(newDept, shopId, companyId, trx);

    return newDept;
  });

  res.status(201).json({
    success: true,
    data: department,
    message: "Department created successfully",
  });
});

/**
 * @desc    Get all departments for a shop
 * @route   GET /api/shops/:shopId/departments
 * @access  Private (Company User)
 */
const getDepartments = asyncHandler(async (req, res) => {
  const { shopId } = req.params;

  // Validate shop exists
  const shop = await Shop.findById(shopId);
  if (!shop) {
    res.status(404);
    throw new Error("Shop not found");
  }

  // Verify company ownership
  const companyId = req.user?.companyId || req.body.companyId;
  if (shop.company_id !== companyId) {
    res.status(403);
    throw new Error("Unauthorized: Shop does not belong to your company");
  }

  const departments = await ShopDepartment.findByShop(shopId);

  res.json({
    success: true,
    data: departments,
    shopId,
  });
});

/**
 * @desc    Get department by ID
 * @route   GET /api/shops/:shopId/departments/:deptId
 * @access  Private (Company User)
 */
const getDepartmentById = asyncHandler(async (req, res) => {
  const { shopId, deptId } = req.params;

  // Validate shop exists
  const shop = await Shop.findById(shopId);
  if (!shop) {
    res.status(404);
    throw new Error("Shop not found");
  }

  // Verify company ownership
  const companyId = req.user?.companyId || req.body.companyId;
  if (shop.company_id !== companyId) {
    res.status(403);
    throw new Error("Unauthorized: Shop does not belong to your company");
  }

  const department = await ShopDepartment.findById(deptId);
  if (!department || department.shop_id !== shopId) {
    res.status(404);
    throw new Error("Department not found");
  }

  res.json({
    success: true,
    data: department,
  });
});

/**
 * @desc    Update department
 * @route   PATCH /api/shops/:shopId/departments/:deptId
 * @access  Private (Company Admin)
 */
const updateDepartment = asyncHandler(async (req, res) => {
  const { shopId, deptId } = req.params;
  const { name, description, capacity } = req.body;

  // Validate shop exists
  const shop = await Shop.findById(shopId);
  if (!shop) {
    res.status(404);
    throw new Error("Shop not found");
  }

  // Verify company ownership
  const companyId = req.user?.companyId || req.body.companyId;
  if (shop.company_id !== companyId) {
    res.status(403);
    throw new Error("Unauthorized: Shop does not belong to your company");
  }

  const department = await ShopDepartment.findById(deptId);
  if (!department || department.shop_id !== shopId) {
    res.status(404);
    throw new Error("Department not found");
  }

  // Check if new name is unique (if name is being changed)
  if (name && name !== department.name) {
    const isUnique = await ShopDepartment.isNameUnique(shopId, name, deptId);
    if (!isUnique) {
      res.status(409);
      throw new Error("Department name already exists in this shop");
    }
  }

  // Update department with transaction
  const updated = await db.transaction(async (trx) => {
    const updatedDept = await ShopDepartment.update(
      deptId,
      {
        name: name || department.name,
        description: description !== undefined ? description : department.description,
        capacity: capacity !== undefined ? capacity : department.capacity,
        updated_by: req.user?.id || null,
      },
      trx
    );

    // Create outbox event
    await departmentEvents.updated(updatedDept, shopId, companyId, trx);

    return updatedDept;
  });

  res.json({
    success: true,
    data: updated,
    message: "Department updated successfully",
  });
});

/**
 * @desc    Delete department
 * @route   DELETE /api/shops/:shopId/departments/:deptId
 * @access  Private (Company Admin)
 */
const deleteDepartment = asyncHandler(async (req, res) => {
  const { shopId, deptId } = req.params;

  // Validate shop exists
  const shop = await Shop.findById(shopId);
  if (!shop) {
    res.status(404);
    throw new Error("Shop not found");
  }

  // Verify company ownership
  const companyId = req.user?.companyId || req.body.companyId;
  if (shop.company_id !== companyId) {
    res.status(403);
    throw new Error("Unauthorized: Shop does not belong to your company");
  }

  const department = await ShopDepartment.findById(deptId);
  if (!department || department.shop_id !== shopId) {
    res.status(404);
    throw new Error("Department not found");
  }

  // Delete department with transaction
  await db.transaction(async (trx) => {
    await ShopDepartment.delete(deptId, req.user?.id || null, trx);

    // Create outbox event
    await departmentEvents.deleted(deptId, shopId, companyId, trx);
  });

  res.json({
    success: true,
    message: "Department deleted successfully",
  });
});

module.exports = {
  createDepartment,
  getDepartments,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
};

