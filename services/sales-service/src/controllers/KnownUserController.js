const knownUserService = require("../services/knownUser.service");

/**
 * Create a new KnownUser
 * Validates that name, phone, and email are unique per company
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

    // Validate required fields
    if (!customerName || !customerPhone) {
      return res.status(400).json({
        message:
          "Missing required fields: customerName, customerPhone",
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

    return res.status(201).json({
      message: "KnownUser created successfully",
      data: knownUser,
    });
  } catch (error) {
    console.error("createKnownUser error:", error);
    // Check if it's a duplicate error (unique constraint violation)
    if (
      error.message.includes("Unique") ||
      error.message.includes("unique")
    ) {
      return res.status(409).json({
        message:
          "A customer with this phone or email already exists for this company",
        error: error.message,
      });
    }
    return res.status(500).json({ error: error.message });
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
      return res.status(404).json({ message: "KnownUser not found" });
    }

    return res.json(knownUser);
  } catch (error) {
    console.error("getKnownUser error:", error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * List all KnownUsers for a company
 */
const listKnownUsers = async (req, res) => {
  try {
    const { companyId } = req.query;
    const { limit = 10, offset = 0, isActive = "true" } = req.query;

    if (!companyId) {
      return res.status(400).json({ message: "companyId is required" });
    }

    const knownUsers = await knownUserService.listKnownUsers(companyId, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      isActive: isActive === "true",
    });

    return res.json(knownUsers);
  } catch (error) {
    console.error("listKnownUsers error:", error);
    return res.status(500).json({ error: error.message });
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
      return res.status(400).json({ message: "No valid fields to update" });
    }

    const knownUser = await knownUserService.updateKnownUser(id, updateData);
    return res.json({
      message: "KnownUser updated successfully",
      data: knownUser,
    });
  } catch (error) {
    console.error("updateKnownUser error:", error);
    if (error.message.includes("not found")) {
      return res.status(404).json({ message: error.message });
    }
    if (
      error.message.includes("Unique") ||
      error.message.includes("unique")
    ) {
      return res.status(409).json({
        message:
          "A customer with this phone or email already exists for this company",
        error: error.message,
      });
    }
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Deactivate a KnownUser (soft delete)
 */
const deactivateKnownUser = async (req, res) => {
  try {
    const { id } = req.params;

    const knownUser = await knownUserService.deactivateKnownUser(id);
    return res.json({
      message: "KnownUser deactivated successfully",
      data: knownUser,
    });
  } catch (error) {
    console.error("deactivateKnownUser error:", error);
    if (error.message.includes("not found")) {
      return res.status(404).json({ message: error.message });
    }
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Search KnownUsers by phone or email
 */
const searchKnownUsers = async (req, res) => {
  try {
    const { companyId, phone, email } = req.query;

    if (!companyId) {
      return res.status(400).json({ message: "companyId is required" });
    }

    if (!phone && !email) {
      return res
        .status(400)
        .json({ message: "At least phone or email is required" });
    }

    const { KnownUser } = require("../models/index.model");
    const { Op } = require("sequelize");

    const where = { companyId, isActive: true };
    if (phone) where.customerPhone = phone;
    if (email) where.customerEmail = email;

    const knownUsers = await KnownUser.findAll({ where });
    return res.json(knownUsers);
  } catch (error) {
    console.error("searchKnownUsers error:", error);
    return res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createKnownUser,
  getKnownUser,
  listKnownUsers,
  updateKnownUser,
  deactivateKnownUser,
  searchKnownUsers,
};
