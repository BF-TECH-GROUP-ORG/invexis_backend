const knownUserService = require("../services/knownUser.service");
const redisHelper = require("../utils/redisHelper");

/**
 * Cache invalidation helper for KnownUsers
 */
const invalidateUserCache = async () => {
  try {
    await redisHelper.scanDel("known_users:*");
    console.log("🧹 Invalidated KnownUser Redis cache");
  } catch (err) {
    console.error("❌ Failed to invalidate user cache:", err);
  }
};

/**
 * Create a new KnownUser (System-Wide)
 */
const createKnownUser = async (req, res) => {
  try {
    const {
      companyId,
      customerId,
      customerName,
      customerPhone,
      customerEmail,
      customerAddress,
    } = req.body;

    if (!customerName || !customerPhone) {
      return res.status(400).json({
        message: "Missing required fields: customerName, customerPhone",
      });
    }

    const knownUser = await knownUserService.findOrCreateKnownUser({
      companyId,
      customerId,
      customerName,
      customerPhone,
      customerEmail,
      customerAddress,
    });

    await invalidateUserCache();

    return res.status(201).json({
      success: true,
      message: "KnownUser created successfully",
      data: knownUser,
    });
  } catch (error) {
    console.error("createKnownUser error:", error);
    const [code, msg] = error.message.includes(":")
      ? error.message.split(":").map(s => s.trim())
      : ["SYSTEM_ERROR", error.message];

    const statusCode = code === "VALIDATION_ERROR" ? 400 : code === "CONFLICT_ERROR" ? 409 : 500;
    return res.status(statusCode).json({
      success: false,
      error: code,
      message: msg
    });
  }
};

/**
 * Get a specific KnownUser by ID
 */
const getKnownUser = async (req, res) => {
  try {
    const { id } = req.params;

    const knownUser = await knownUserService.getKnownUserById(id);
    if (!knownUser) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "KnownUser not found"
      });
    }

    return res.json({
      success: true,
      data: knownUser
    });
  } catch (error) {
    console.error("getKnownUser error:", error);
    return res.status(500).json({
      success: false,
      error: "DATABASE_ERROR",
      message: error.message
    });
  }
};

/**
 * List KnownUsers (filtered by company or all)
 */
const listKnownUsers = async (req, res) => {
  try {
    const { companyId, limit = 10, offset = 0, isActive = "true" } = req.query;
    const L = parseInt(limit);
    const O = parseInt(offset);
    const A = isActive === "true";

    // Redis Cache Key
    const cacheKey = `known_users:list:comp=${companyId || 'all'}:L=${L}:O=${O}:A=${A}`;
    const cachedData = await redisHelper.getCache(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    const result = await knownUserService.listKnownUsers(companyId, {
      limit: L,
      offset: O,
      isActive: A,
    });

    const response = {
      success: true,
      data: result.users,
      pagination: {
        totalCount: result.totalCount,
        totalPages: Math.ceil(result.totalCount / L),
        currentPage: Math.floor(O / L) + 1,
        limit: L,
        offset: O
      }
    };

    await redisHelper.setCache(cacheKey, response, 3600);
    return res.json(response);
  } catch (error) {
    console.error("listKnownUsers error:", error);
    return res.status(500).json({
      success: false,
      error: "DATABASE_ERROR",
      message: error.message
    });
  }
};

/**
 * Get all KnownUsers in the system
 */
const getAllUsers = async (req, res) => {
  try {
    const { limit = 50, offset = 0, isActive = "true" } = req.query;
    const L = parseInt(limit);
    const O = parseInt(offset);
    const A = isActive === "true";

    // Redis Cache Key
    const cacheKey = `known_users:all:L=${L}:O=${O}:A=${A}`;
    const cachedData = await redisHelper.getCache(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    const result = await knownUserService.getAllKnownUsers({
      limit: L,
      offset: O,
      isActive: A,
    });

    const response = {
      success: true,
      data: result.users,
      pagination: {
        totalCount: result.totalCount,
        totalPages: Math.ceil(result.totalCount / L),
        currentPage: Math.floor(O / L) + 1,
        limit: L,
        offset: O
      }
    };

    await redisHelper.setCache(cacheKey, response, 3600);
    return res.json(response);
  } catch (error) {
    console.error("getAllUsers error:", error);
    return res.status(500).json({
      success: false,
      error: "DATABASE_ERROR",
      message: error.message
    });
  }
};

/**
 * Update a KnownUser
 */
const updateKnownUser = async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = [
      "customerName",
      "customerPhone",
      "customerEmail",
      "customerAddress",
      "customerId",
    ];
    const updateData = {};

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updateData[key] = req.body[key];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: "No valid fields to update"
      });
    }

    const knownUser = await knownUserService.updateKnownUser(id, updateData);
    await invalidateUserCache();
    return res.json({
      success: true,
      message: "KnownUser updated successfully",
      data: knownUser,
    });
  } catch (error) {
    console.error("updateKnownUser error:", error);
    const [code, msg] = error.message.includes(":")
      ? error.message.split(":").map(s => s.trim())
      : ["SYSTEM_ERROR", error.message];

    const statusCode = code === "VALIDATION_ERROR" ? 400 : code === "NOT_FOUND" ? 404 : code === "CONFLICT_ERROR" ? 409 : 500;
    return res.status(statusCode).json({
      success: false,
      error: code,
      message: msg
    });
  }
};

/**
 * Deactivate a KnownUser (soft delete)
 */
const deactivateKnownUser = async (req, res) => {
  try {
    const { id } = req.params;

    const knownUser = await knownUserService.deactivateKnownUser(id);
    await invalidateUserCache();
    return res.json({
      success: true,
      message: "KnownUser deactivated successfully",
      data: knownUser,
    });
  } catch (error) {
    console.error("deactivateKnownUser error:", error);
    const [code, msg] = error.message.includes(":")
      ? error.message.split(":").map(s => s.trim())
      : ["SYSTEM_ERROR", error.message];

    const statusCode = code === "VALIDATION_ERROR" ? 400 : code === "NOT_FOUND" ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      error: code,
      message: msg
    });
  }
};

/**
 * Search KnownUsers by phone or email
 */
const searchKnownUsers = async (req, res) => {
  try {
    const { companyId, phone, email } = req.query;

    if (!phone && !email) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: "At least phone or email is required"
      });
    }

    const { KnownUser } = require("../models/index.model");
    const { Op, fn, col } = require("sequelize");

    const where = { isActive: true };
    if (phone) where.customerPhone = phone;
    if (email) where.customerEmail = email;

    if (companyId) {
      where[Op.and] = [
        fn('JSON_CONTAINS', col('associatedCompanyIds'), JSON.stringify(companyId))
      ];
    }

    const knownUsers = await KnownUser.findAll({ where });
    return res.json({
      success: true,
      data: knownUsers
    });
  } catch (error) {
    console.error("searchKnownUsers error:", error);
    return res.status(500).json({
      success: false,
      error: "DATABASE_ERROR",
      message: error.message
    });
  }
};

module.exports = {
  createKnownUser,
  getKnownUser,
  listKnownUsers,
  getAllUsers,
  updateKnownUser,
  deactivateKnownUser,
  searchKnownUsers,
};
