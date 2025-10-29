"use strict";

const db = require("../config/db");
const { v4: uuidv4 } = require("uuid");

class ShopPreferences {
  static table = "shop_preferences";

  constructor(data) {
    this.id = data.id || uuidv4();
    this.shop_id = data.shop_id;
    this.key = data.key;
    this.value = data.value || null;
    this.created_by = data.created_by || null;
    this.updated_by = data.updated_by || null;
    this.created_at = data.created_at || new Date();
    this.updated_at = data.updated_at || new Date();
    this.deleted_at = data.deleted_at || null;
  }

  /**
   * Create preference
   */
  static async create(data, trx = null) {
    const pref = new ShopPreferences(data);
    const query = db(this.table).insert(pref);
    if (trx) query.transacting(trx);
    await query;
    return pref;
  }

  /**
   * Find by ID
   */
  static async findById(id, trx = null) {
    let query = db(this.table).where({ id }).whereNull("deleted_at").first();
    if (trx) query = query.transacting(trx);
    return await query;
  }

  /**
   * Find by shop and key
   */
  static async findByShopAndKey(shopId, key, trx = null) {
    let query = db(this.table)
      .where({ shop_id: shopId, key })
      .whereNull("deleted_at")
      .first();
    if (trx) query = query.transacting(trx);
    return await query;
  }

  /**
   * Find all preferences by shop
   */
  static async findByShop(shopId, trx = null) {
    let query = db(this.table)
      .where({ shop_id: shopId })
      .whereNull("deleted_at");
    if (trx) query = query.transacting(trx);
    return await query;
  }

  /**
   * Get all preferences as object
   */
  static async getAsObject(shopId, trx = null) {
    const prefs = await this.findByShop(shopId, trx);
    const obj = {};
    prefs.forEach((pref) => {
      obj[pref.key] = pref.value;
    });
    return obj;
  }

  /**
   * Update preference
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
   * Update or create preference
   */
  static async upsert(shopId, key, value, updatedBy = null, trx = null) {
    const existing = await this.findByShopAndKey(shopId, key, trx);
    
    if (existing) {
      return await this.update(existing.id, { value, updated_by: updatedBy }, trx);
    } else {
      return await this.create(
        {
          shop_id: shopId,
          key,
          value,
          created_by: updatedBy,
          updated_by: updatedBy,
        },
        trx
      );
    }
  }

  /**
   * Soft delete preference
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
   * Check if exists
   */
  static async exists(id, trx = null) {
    let query = db(this.table).where({ id }).whereNull("deleted_at").first();
    if (trx) query = query.transacting(trx);
    const pref = await query;
    return !!pref;
  }

  /**
   * Bulk upsert preferences
   */
  static async bulkUpsert(shopId, preferencesObject, updatedBy = null, trx = null) {
    const results = [];
    for (const [key, value] of Object.entries(preferencesObject)) {
      const result = await this.upsert(shopId, key, value, updatedBy, trx);
      results.push(result);
    }
    return results;
  }
}

module.exports = ShopPreferences;

