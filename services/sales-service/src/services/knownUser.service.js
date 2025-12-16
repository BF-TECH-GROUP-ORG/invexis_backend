// services/knownUser.service.js
const { KnownUser } = require("../models/index.model");
const { hashIdentifier } = require("../utils/hash");

/**
 * Find or create a KnownUser to avoid duplicity
 * Checks for existing user by phone and email within the company
 * @param {Object} userData - { companyId, customerId, customerName, customerPhone, customerEmail, customerAddress }
 * @param {Object} transaction - Sequelize transaction
 * @returns {Promise<Object>} KnownUser record
 */
const findOrCreateKnownUser = async (userData, transaction = null) => {
  const {
    companyId,
    customerId = null,
    customerName,
    customerPhone,
    customerEmail,
    customerAddress = null,
  } = userData;

  // Validate required fields (email is optional)
  if (!companyId || !customerName || !customerPhone) {
    throw new Error(
      "Missing required fields: companyId, customerName, customerPhone"
    );
  }

  try {
    // Check if user already exists by phone or email within the company
    const whereConditions = [{ customerPhone }];

    // Only search by email if it's provided
    if (customerEmail) {
      whereConditions.push({ customerEmail });
    }

    let knownUser = await KnownUser.findOne({
      where: {
        companyId,
        [require("sequelize").Op.or]: whereConditions,
      },
      transaction,
    });

    if (knownUser) {
      // Update if customerId is provided and not already set
      const updates = {};
      if (customerId && !knownUser.customerId) {
        updates.customerId = customerId;
      }
      // Backfill hashedCustomerId if missing
      if (!knownUser.hashedCustomerId) {
        updates.hashedCustomerId =
          hashIdentifier(customerPhone || customerEmail || `${companyId}:${knownUser.knownUserId}`) || "";
      }
      if (Object.keys(updates).length) {
        await knownUser.update(updates, { transaction });
      }
      return knownUser;
    }

    // Compute hashedCustomerId for new KnownUser (prefer phone, then email, then fallback)
    const hashedCustomerId =
      hashIdentifier(customerPhone || customerEmail || `${companyId}:${customerName}`) || "";

    // Create new KnownUser if not found
    knownUser = await KnownUser.create(
      {
        companyId,
        customerId,
        customerName,
        customerPhone,
        customerEmail,
        customerAddress,
        hashedCustomerId,
        isActive: true,
      },
      { transaction }
    );

    return knownUser;
  } catch (error) {
    throw new Error(`Failed to find or create KnownUser: ${error.message}`);
  }
};

/**
 * Get KnownUser by ID
 * @param {number} knownUserId
 * @returns {Promise<Object>} KnownUser record
 */
const getKnownUserById = async (knownUserId) => {
  try {
    const knownUser = await KnownUser.findByPk(knownUserId);
    return knownUser;
  } catch (error) {
    throw new Error(`Failed to get KnownUser: ${error.message}`);
  }
};

/**
 * List all KnownUsers for a company
 * @param {string} companyId
 * @param {Object} options - { limit, offset, isActive }
 * @returns {Promise<Array>} KnownUser records
 */
const listKnownUsers = async (companyId, options = {}) => {
  const { limit = 10, offset = 0, isActive = true } = options;

  try {
    const knownUsers = await KnownUser.findAll({
      where: {
        companyId,
        isActive,
      },
      limit,
      offset,
      order: [["createdAt", "DESC"]],
    });

    return knownUsers;
  } catch (error) {
    throw new Error(`Failed to list KnownUsers: ${error.message}`);
  }
};

/**
 * Update KnownUser
 * @param {number} knownUserId
 * @param {Object} updateData
 * @param {Object} transaction
 * @returns {Promise<Object>} Updated KnownUser
 */
const updateKnownUser = async (knownUserId, updateData, transaction = null) => {
  try {
    const knownUser = await KnownUser.findByPk(knownUserId, { transaction });
    if (!knownUser) {
      throw new Error("KnownUser not found");
    }

    await knownUser.update(updateData, { transaction });
    return knownUser;
  } catch (error) {
    throw new Error(`Failed to update KnownUser: ${error.message}`);
  }
};

/**
 * Soft delete KnownUser
 * @param {number} knownUserId
 * @param {Object} transaction
 * @returns {Promise<Object>} Updated KnownUser
 */
const deactivateKnownUser = async (knownUserId, transaction = null) => {
  try {
    const knownUser = await KnownUser.findByPk(knownUserId, { transaction });
    if (!knownUser) {
      throw new Error("KnownUser not found");
    }

    await knownUser.update({ isActive: false }, { transaction });
    return knownUser;
  } catch (error) {
    throw new Error(`Failed to deactivate KnownUser: ${error.message}`);
  }
};

module.exports = {
  findOrCreateKnownUser,
  getKnownUserById,
  listKnownUsers,
  updateKnownUser,
  deactivateKnownUser,
};

