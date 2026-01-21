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
/**
 * Find or create a KnownUser to avoid duplicity (System-Wide)
 * Checks for existing user globally by phone and email
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

  // 1. Precise Validation
  if (!customerPhone) {
    throw new Error("VALIDATION_ERROR: Customer phone is mandatory");
  }
  if (!customerName) {
    throw new Error("VALIDATION_ERROR: Customer name is mandatory");
  }

  try {
    // 2. Efficient Global Search
    const whereConditions = [{ customerPhone }];
    if (customerEmail) {
      whereConditions.push({ customerEmail });
    }

    let knownUser = await KnownUser.findOne({
      where: {
        [require("sequelize").Op.or]: whereConditions,
      },
      transaction,
    });

    if (knownUser) {
      const updates = {};

      // Update basic info if missing
      if (customerId && !knownUser.customerId) updates.customerId = customerId;
      if (customerAddress && !knownUser.customerAddress) updates.customerAddress = customerAddress;
      if (customerEmail && !knownUser.customerEmail) updates.customerEmail = customerEmail;

      // 3. Optimized Company Association using Set
      if (companyId) {
        const companySet = new Set(knownUser.associatedCompanyIds || []);
        if (!companySet.has(companyId)) {
          companySet.add(companyId);
          updates.associatedCompanyIds = Array.from(companySet);
        }
      }

      if (!knownUser.hashedCustomerId) {
        updates.hashedCustomerId = hashIdentifier(customerPhone) || "";
      }

      if (Object.keys(updates).length > 0) {
        await knownUser.update(updates, { transaction });
      }
      return knownUser;
    }

    // 4. Creation Logic
    const hashedCustomerId = hashIdentifier(customerPhone) || "";

    knownUser = await KnownUser.create(
      {
        associatedCompanyIds: companyId ? [companyId] : [],
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
    if (error.name === 'SequelizeUniqueConstraintError') {
      throw new Error(`CONFLICT_ERROR: A user with this phone or email already exists`);
    }
    throw new Error(`DATABASE_ERROR: ${error.message}`);
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
 * List KnownUsers (filtered by company or global)
 * @param {string} companyId - Optional filter
 * @param {Object} options - { limit, offset, isActive }
 * @returns {Promise<Array>} KnownUser records
 */
const listKnownUsers = async (companyId = null, options = {}) => {
  const { limit = 10, offset = 0, isActive = true } = options;

  try {
    const where = { isActive };

    // Using Sequelize.fn or Op.contains for JSON if supported, 
    // but a simple Op.like on the stringified array is a fallback for older versions 
    // or we use Op.and with JSON search logic depending on the DB. 
    // For MySQL 5.7+ we can use JSON_CONTAINS
    const { Op, fn, col } = require("sequelize");
    if (companyId) {
      where[Op.and] = [
        fn('JSON_CONTAINS', col('associatedCompanyIds'), JSON.stringify(companyId))
      ];
    }

    const { count, rows: knownUsers } = await KnownUser.findAndCountAll({
      where,
      limit,
      offset,
      order: [["createdAt", "DESC"]],
    });

    return {
      users: knownUsers,
      totalCount: count,
      limit,
      offset,
    };
  } catch (error) {
    throw new Error(`Failed to list KnownUsers: ${error.message}`);
  }
};

/**
 * List all KnownUsers globally
 */
const getAllKnownUsers = async (options = {}) => {
  return listKnownUsers(null, options);
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
  getAllKnownUsers,
  updateKnownUser,
  deactivateKnownUser,
};

