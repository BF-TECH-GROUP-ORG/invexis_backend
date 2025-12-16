"use strict";

const asyncHandler = require("express-async-handler");
const { Shop, ShopOperatingHours, ShopPreferences } = require("../models/index.model");
const { shopEvents } = require("../events/eventHelpers");
const db = require("../config/db");

/**
 * @desc    Create a new shop
 * @route   POST /api/shops
 * @access  Private (Company Admin)
 */
const createShop = asyncHandler(async (req, res) => {
  const {
    name,
    address_line1,
    address_line2,
    city,
    region,
    country,
    postal_code,
    latitude,
    longitude,
    capacity,
    timezone,
    operatingHours,
    preferences,
  } = req.body;

  const companyId = req.user?.companyId || req.body.companyId;
  if (!companyId) {
    res.status(400);
    throw new Error("Company ID is required");
  }

  // Validate required fields
  if (!name || !address_line1 || !city || !country) {
    res.status(400);
    throw new Error("Missing required fields: name, address_line1, city, country");
  }

  // Check if shop name is unique within company
  const isUnique = await Shop.isNameUnique(companyId, name);
  if (!isUnique) {
    res.status(409);
    throw new Error("Shop name already exists in this company");
  }

  // Create shop with transaction
  const shop = await db.transaction(async (trx) => {
    const newShop = await Shop.create(
      {
        company_id: companyId,
        name,
        address_line1,
        address_line2,
        city,
        region,
        country,
        postal_code,
        latitude,
        longitude,
        capacity: capacity || 0,
        timezone: timezone || "UTC",
        status: "open",
        created_by: req.user?.id || null,
      },
      trx
    );

    // Create operating hours if provided
    if (operatingHours && Array.isArray(operatingHours)) {
      await ShopOperatingHours.bulkCreate(
        newShop.id,
        operatingHours,
        req.user?.id || null,
        trx
      );
    }

    // Create preferences if provided
    if (preferences && typeof preferences === "object") {
      await ShopPreferences.bulkUpsert(
        newShop.id,
        preferences,
        req.user?.id || null,
        trx
      );
    }

    // Create outbox event
    await shopEvents.created(newShop, trx);

    return newShop;
  });

  res.status(201).json({
    success: true,
    data: shop,
    message: "Shop created successfully",
  });
});

/**
 * @desc    Get all shops for a company
 * @route   GET /api/shops
 * @access  Private (Company User)
 */
const getShops = asyncHandler(async (req, res) => {
  // DEBUG: Log all possible sources of companyId
  console.log('🔍 DEBUG getShops - req.query:', JSON.stringify(req.query));
  console.log('🔍 DEBUG getShops - req.body:', JSON.stringify(req.body));
  console.log('🔍 DEBUG getShops - req.params:', JSON.stringify(req.params));
  console.log('🔍 DEBUG getShops - req.user:', req.user);

  // Extract companyId and ensure it's a string, not an object
  let companyId = req.query.companyId || req.body.companyId || req.params.companyId;

  console.log('🔍 DEBUG getShops - extracted companyId:', companyId);
  console.log('🔍 DEBUG getShops - companyId type:', typeof companyId);

  // If companyId is an object, try to extract the actual ID
  if (typeof companyId === 'object' && companyId !== null) {
    console.log('⚠️  WARNING: companyId is an object, attempting to extract ID');
    console.log('🔍 DEBUG getShops - companyId object:', JSON.stringify(companyId));
    companyId = companyId.id || companyId.companyId || companyId.company_id;
    console.log('🔍 DEBUG getShops - extracted from object:', companyId);
  }

  // Validate companyId is a string
  if (!companyId || typeof companyId !== 'string') {
    console.error('❌ ERROR: Invalid companyId -', companyId, 'type:', typeof companyId);
    res.status(400);
    throw new Error(`Valid Company ID (string) is required. Received: ${typeof companyId}`);
  }

  console.log('✅ Using companyId:', companyId);

  const { limit = 50, offset = 0, status } = req.query;

  let shops;
  if (status) {
    shops = await Shop.findByCompanyAndStatus(companyId, status);
  } else {
    shops = await Shop.findByCompany(companyId, { limit: parseInt(limit), offset: parseInt(offset) });
  }

  const total = await Shop.countByCompany(companyId);

  res.json({
    success: true,
    data: shops,
    pagination: {
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
    },
  });
});

/**
 * @desc    Get shop by ID
 * @route   GET /api/shops/:id
 * @access  Private (Company User)
 */
const getShopById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const shop = await Shop.findById(id);
  if (!shop) {
    res.status(404);
    throw new Error("Shop not found");
  }

  // Verify company ownership
  const companyId = req.user?.companyId || req.body.companyId || req.query.companyId;
  if (shop.company_id !== companyId) {
    res.status(403);
    throw new Error("Unauthorized: Shop does not belong to your company");
  }

  res.json({
    success: true,
    data: shop,
  });
});

/**
 * @desc    Update shop
 * @route   PATCH /api/shops/:id
 * @access  Private (Company Admin)
 */
const updateShop = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, address_line1, address_line2, city, region, country, postal_code, latitude, longitude, capacity, timezone } = req.body;

  const shop = await Shop.findById(id);
  if (!shop) {
    res.status(404);
    throw new Error("Shop not found");
  }

  // Verify company ownership
  const companyId = req.user?.companyId || req.body.companyId || req.query.companyId;
  if (shop.company_id !== companyId) {
    res.status(403);
    throw new Error("Unauthorized: Shop does not belong to your company");
  }

  // Check if new name is unique (if name is being changed)
  if (name && name !== shop.name) {
    const isUnique = await Shop.isNameUnique(companyId, name, id);
    if (!isUnique) {
      res.status(409);
      throw new Error("Shop name already exists in this company");
    }
  }

  // Update shop with transaction
  const updated = await db.transaction(async (trx) => {
    const updatedShop = await Shop.update(
      id,
      {
        name: name || shop.name,
        address_line1: address_line1 || shop.address_line1,
        address_line2: address_line2 !== undefined ? address_line2 : shop.address_line2,
        city: city || shop.city,
        region: region !== undefined ? region : shop.region,
        country: country || shop.country,
        postal_code: postal_code !== undefined ? postal_code : shop.postal_code,
        latitude: latitude !== undefined ? latitude : shop.latitude,
        longitude: longitude !== undefined ? longitude : shop.longitude,
        capacity: capacity !== undefined ? capacity : shop.capacity,
        timezone: timezone || shop.timezone,
        updated_by: req.user?.id || null,
      },
      trx
    );

    // Create outbox event
    await shopEvents.updated(updatedShop, trx);

    return updatedShop;
  });

  res.json({
    success: true,
    data: updated,
    message: "Shop updated successfully",
  });
});

/**
 * @desc    Change shop status
 * @route   PATCH /api/shops/:id/status
 * @access  Private (Company Admin)
 */
const changeShopStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status || !["open", "closed"].includes(status)) {
    res.status(400);
    throw new Error("Invalid status. Must be 'open' or 'closed'");
  }

  const shop = await Shop.findById(id);
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

  // Change status with transaction
  const updated = await db.transaction(async (trx) => {
    const updatedShop = await Shop.changeStatus(
      id,
      status,
      req.user?.id || null,
      trx
    );

    // Create outbox event
    await shopEvents.statusChanged(id, companyId, shop.status, status, trx);

    return updatedShop;
  });

  res.json({
    success: true,
    data: updated,
    message: `Shop status changed to ${status}`,
  });
});

/**
 * @desc    Delete shop
 * @route   DELETE /api/shops/:id
 * @access  Private (Company Admin)
 */
const deleteShop = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const shop = await Shop.findById(id);
  if (!shop) {
    res.status(404);
    throw new Error("Shop not found");
  }

  // Verify company ownership
  const companyId = req.user?.companyId || req.body.companyId || req.query.companyId;
  if (shop.company_id !== companyId) {
    res.status(403);
    throw new Error("Unauthorized: Shop does not belong to your company");
  }

  // Delete shop with transaction
  await db.transaction(async (trx) => {
    await Shop.delete(id, req.user?.id || null, trx);

    // Create outbox event
    await shopEvents.deleted(id, companyId, trx);
  });

  res.json({
    success: true,
    message: "Shop deleted successfully",
  });
});

/**
 * @desc    Search shops
 * @route   GET /api/shops/search
 * @access  Private (Company User)
 */
const searchShops = asyncHandler(async (req, res) => {
  const { q } = req.query;
  const companyId = req.user?.companyId || req.body.companyId;

  if (!companyId) {
    res.status(400);
    throw new Error("Company ID is required");
  }

  if (!q || q.trim().length < 2) {
    res.status(400);
    throw new Error("Search query must be at least 2 characters");
  }

  const shops = await Shop.search(companyId, q);

  res.json({
    success: true,
    data: shops,
    query: q,
  });
});

module.exports = {
  createShop,
  getShops,
  getShopById,
  updateShop,
  changeShopStatus,
  deleteShop,
  searchShops,
};

