"use strict";

const db = require("../config/db");
const { v4: uuidv4 } = require("uuid");

// Simple UUID v4 validator to avoid passing invalid values to Postgres uuid columns
function isValidUuid(val) {
  if (!val || typeof val !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);
}
class Shop {
  static table = "shops";

  constructor(data) {
    this.id = data.id || uuidv4();
    this.company_id = data.company_id;
    this.name = data.name;
    this.address_line1 = data.address_line1;
    this.address_line2 = data.address_line2 || null;
    this.city = data.city;
    this.region = data.region || null;
    this.country = data.country;
    this.postal_code = data.postal_code || null;
    this.latitude = data.latitude || null;
    this.longitude = data.longitude || null;
    this.capacity = data.capacity || 0;
    this.timezone = data.timezone || "UTC";
    this.status = data.status || "open";
    this.created_by = data.created_by || null;
    this.updated_by = data.updated_by || null;
    this.created_at = data.created_at || new Date();
    this.updated_at = data.updated_at || new Date();
    this.deleted_at = data.deleted_at || null;
  }

  /**
   * Create a new shop
   */
  static async create(data, trx = null) {
    const shop = new Shop(data);
    const query = db(this.table).insert(shop);
    if (trx) query.transacting(trx);
    await query;
    return shop;
  }

  /**
   * Find shop by ID
   */
  static async findById(id, trx = null) {
    let query = db(this.table).where({ id }).whereNull("deleted_at").first();
    if (trx) query = query.transacting(trx);
    return await query;
  }

  /**
   * Find all shops by company
   */
  static async findByCompany(companyId, { limit = 50, offset = 0 } = {}, trx = null) {
    // Validate companyId early to avoid DB errors when companyId is not a UUID
    if (!isValidUuid(companyId)) {
      // Return empty list for invalid company identifiers instead of letting Postgres throw
      return [];
    }

    let query = db(this.table)
      .where({ company_id: companyId })
      .whereNull("deleted_at")
      .limit(limit)
      .offset(offset);
    if (trx) query = query.transacting(trx);
    return await query;
  }

  /**
   * Find all shops by company and status
   */
  static async findByCompanyAndStatus(companyId, status, trx = null) {
    if (!isValidUuid(companyId)) return [];

    let query = db(this.table)
      .where({ company_id: companyId, status })
      .whereNull("deleted_at");
    if (trx) query = query.transacting(trx);
    return await query;
  }

  /**
   * Update shop
   */
  static async update(id, data, trx = null) {
    const updateData = {
      ...data,
      updated_at: new Date(),
    };
    let query = db(this.table).where({ id }).update(updateData);
    if (trx) query = query.transacting(trx);
    await query;
    return await this.findById(id, trx);
  }

  /**
   * Soft delete shop
   */
  static async delete(id, deletedBy = null, trx = null) {
    const deleteData = {
      deleted_at: new Date(),
      updated_by: deletedBy,
      updated_at: new Date(),
    };
    let query = db(this.table).where({ id }).update(deleteData);
    if (trx) query = query.transacting(trx);
    await query;
  }

  /**
   * Change shop status
   */
  static async changeStatus(id, status, updatedBy = null, trx = null) {
    const updateData = {
      status,
      updated_by: updatedBy,
      updated_at: new Date(),
    };
    let query = db(this.table).where({ id }).update(updateData);
    if (trx) query = query.transacting(trx);
    await query;
    return await this.findById(id, trx);
  }

  /**
   * Check if shop exists
   */
  static async exists(id, trx = null) {
    let query = db(this.table).where({ id }).whereNull("deleted_at").first();
    if (trx) query = query.transacting(trx);
    const shop = await query;
    return !!shop;
  }

  /**
   * Check if shop name is unique within company
   */
  static async isNameUnique(companyId, name, excludeId = null, trx = null) {
    if (!isValidUuid(companyId)) {
      // If companyId isn't valid, return true to avoid false duplicates and avoid DB errors
      return true;
    }

    let query = db(this.table)
      .where({ company_id: companyId, name })
      .whereNull("deleted_at");
    
    if (excludeId) {
      query = query.whereNot({ id: excludeId });
    }
    
    if (trx) query = query.transacting(trx);
    const shop = await query.first();
    return !shop;
  }

  /**
   * Get shop count by company
   */
  static async countByCompany(companyId, trx = null) {
    if (!isValidUuid(companyId)) return 0;

    let query = db(this.table)
      .where({ company_id: companyId })
      .whereNull("deleted_at")
      .count("* as count")
      .first();
    if (trx) query = query.transacting(trx);
    const result = await query;
    return result.count;
  }

  /**
   * Get all shops (admin only)
   */
  static async findAll({ limit = 50, offset = 0, status = null } = {}, trx = null) {
    let query = db(this.table).whereNull("deleted_at").limit(limit).offset(offset);
    
    if (status) {
      query = query.where({ status });
    }
    
    if (trx) query = query.transacting(trx);
    return await query;
  }

  /**
   * Search shops by name
   */
  static async search(companyId, searchTerm, trx = null) {
    if (!isValidUuid(companyId)) return [];

    let query = db(this.table)
      .where({ company_id: companyId })
      .whereNull("deleted_at")
      .where("name", "ilike", `%${searchTerm}%`);
    if (trx) query = query.transacting(trx);
    return await query;
  }
}

module.exports = Shop;

