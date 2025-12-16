"use strict";

const db = require("../config/db");
const { v4: uuidv4 } = require("uuid");

class ShopOperatingHours {
  static table = "shop_operating_hours";

  constructor(data) {
    this.id = data.id || uuidv4();
    this.shop_id = data.shop_id;
    this.day_of_week = data.day_of_week; // 0-6 (Sunday-Saturday)
    this.open_time = data.open_time || null;
    this.close_time = data.close_time || null;
    this.created_by = data.created_by || null;
    this.updated_by = data.updated_by || null;
    this.created_at = data.created_at || new Date();
    this.updated_at = data.updated_at || new Date();
    this.deleted_at = data.deleted_at || null;
  }

  /**
   * Create operating hours
   */
  static async create(data, trx = null) {
    const hours = new ShopOperatingHours(data);
    const query = db(this.table).insert(hours);
    if (trx) query.transacting(trx);
    await query;
    return hours;
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
   * Find all operating hours by shop
   */
  static async findByShop(shopId, trx = null) {
    let query = db(this.table)
      .where({ shop_id: shopId })
      .whereNull("deleted_at")
      .orderBy("day_of_week");
    if (trx) query = query.transacting(trx);
    return await query;
  }

  /**
   * Find operating hours for specific day
   */
  static async findByShopAndDay(shopId, dayOfWeek, trx = null) {
    let query = db(this.table)
      .where({ shop_id: shopId, day_of_week: dayOfWeek })
      .whereNull("deleted_at")
      .first();
    if (trx) query = query.transacting(trx);
    return await query;
  }

  /**
   * Update operating hours
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
   * Soft delete operating hours
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
    const hours = await query;
    return !!hours;
  }

  /**
   * Bulk create operating hours for all days
   */
  static async bulkCreate(shopId, hoursData, createdBy = null, trx = null) {
    const records = hoursData.map((data) => ({
      id: uuidv4(),
      shop_id: shopId,
      day_of_week: data.day_of_week,
      open_time: data.open_time || null,
      close_time: data.close_time || null,
      created_by: createdBy,
      created_at: new Date(),
      updated_at: new Date(),
    }));

    let query = db(this.table).insert(records);
    if (trx) query = query.transacting(trx);
    await query;
    return records;
  }

  /**
   * Get day name
   */
  static getDayName(dayOfWeek) {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return days[dayOfWeek] || "Unknown";
  }
}

module.exports = ShopOperatingHours;

