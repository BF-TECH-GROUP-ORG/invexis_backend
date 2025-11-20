"use strict";

const db = require("../config/db");
const { v4: uuidv4 } = require("uuid");

class ShopDepartment {
  static table = "shop_departments";

  constructor(data) {
    this.id = data.id || uuidv4();
    this.shop_id = data.shop_id;
    this.name = data.name;
    this.description = data.description || null;
    this.capacity = data.capacity || 0;
    this.created_by = data.created_by || null;
    this.updated_by = data.updated_by || null;
    this.created_at = data.created_at || new Date();
    this.updated_at = data.updated_at || new Date();
    this.deleted_at = data.deleted_at || null;
  }

  /**
   * Create a new department
   */
  static async create(data, trx = null) {
    const department = new ShopDepartment(data);
    const query = db(this.table).insert(department);
    if (trx) query.transacting(trx);
    await query;
    return department;
  }

  /**
   * Find department by ID
   */
  static async findById(id, trx = null) {
    let query = db(this.table).where({ id }).whereNull("deleted_at").first();
    if (trx) query = query.transacting(trx);
    return await query;
  }

  /**
   * Find all departments by shop
   */
  static async findByShop(shopId, trx = null) {
    let query = db(this.table)
      .where({ shop_id: shopId })
      .whereNull("deleted_at");
    if (trx) query = query.transacting(trx);
    return await query;
  }

  /**
   * Update department
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
   * Soft delete department
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
   * Check if department exists
   */
  static async exists(id, trx = null) {
    let query = db(this.table).where({ id }).whereNull("deleted_at").first();
    if (trx) query = query.transacting(trx);
    const dept = await query;
    return !!dept;
  }

  /**
   * Check if department name is unique within shop
   */
  static async isNameUnique(shopId, name, excludeId = null, trx = null) {
    let query = db(this.table)
      .where({ shop_id: shopId, name })
      .whereNull("deleted_at");
    
    if (excludeId) {
      query = query.whereNot({ id: excludeId });
    }
    
    if (trx) query = query.transacting(trx);
    const dept = await query.first();
    return !dept;
  }

  /**
   * Get department count by shop
   */
  static async countByShop(shopId, trx = null) {
    let query = db(this.table)
      .where({ shop_id: shopId })
      .whereNull("deleted_at")
      .count("* as count")
      .first();
    if (trx) query = query.transacting(trx);
    const result = await query;
    return result.count;
  }
}

module.exports = ShopDepartment;

