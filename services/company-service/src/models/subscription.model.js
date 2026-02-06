const db = require("../config");
const { v4: uuidv4 } = require("uuid");
const {
  getTierConfig,
  isFeatureEnabled,
} = require("/app/shared/config/tierFeatures.config");

class Subscription {
  static table = "subscriptions";

  constructor(data) {
    this.id = uuidv4();
    this.company_id = data.company_id;
    this.tier = data.tier || "Basic";
    this.start_date = data.start_date || new Date();
    this.end_date = data.end_date || null;
    this.is_active = data.is_active !== undefined ? data.is_active : true;
    this.amount = data.amount || 0;
    this.currency = data.currency || "RWF";

    // Advanced Billing Fields (Moved from Payment Service)
    this.auto_renew = data.auto_renew !== undefined ? data.auto_renew : false;
    this.payment_priority = data.payment_priority || ["MTN", "CARD"];
    this.stripe_payment_method_id = data.stripe_payment_method_id || null;
    this.momo_phone_number = data.momo_phone_number || null;
    this.last_billing_status = data.last_billing_status || null;
    this.last_billing_attempt = data.last_billing_attempt || null;

    this.payment_reference = data.payment_reference || null;
    this.metadata = data.metadata || {};
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  /**
   * Create subscription record (supports transactions)
   * @param {object} data - Subscription data
   * @param {object} trx - Optional Knex transaction
   */
  static async create(data, trx = null) {
    const sub = new Subscription(data);
    const query = db(this.table);
    if (trx) query.transacting(trx);
    await query.insert(sub);
    return sub;
  }

  // ✅ Get subscription by company
  static async findByCompany(companyId) {
    return db(this.table).where({ company_id: companyId }).first();
  }

  /**
   * Update subscription (supports transactions)
   * @param {string} companyId - Company ID
   * @param {object} data - Update data
   * @param {object} trx - Optional Knex transaction
   */
  static async update(companyId, data, trx = null) {
    const query = db(this.table).where({ company_id: companyId });
    if (trx) query.transacting(trx);

    await query.update({
      ...data,
      updatedAt: new Date(),
    });

    return this.findByCompany(companyId, trx);
  }

  /**
   * Deactivate subscription (supports transactions)
   * @param {string} companyId - Company ID
   * @param {object} trx - Optional Knex transaction
   */
  static async deactivate(companyId, trx = null) {
    const query = db(this.table).where({ company_id: companyId });
    if (trx) query.transacting(trx);

    await query.update({ is_active: false, updatedAt: new Date() });
    return this.findByCompany(companyId, trx);
  }

  /**
   * Renew subscription (supports transactions)
   * @param {string} companyId - Company ID
   * @param {string} tier - New tier
   * @param {number} amount - New amount
   * @param {number} durationDays - Duration in days
   * @param {object} trx - Optional Knex transaction
   */
  static async renew(companyId, tier, amount, durationDays, trx = null) {
    const start = new Date();
    const end = new Date(start);
    end.setDate(start.getDate() + durationDays);

    const query = db(this.table).where({ company_id: companyId });
    if (trx) query.transacting(trx);

    await query.update({
      tier,
      amount,
      start_date: start,
      end_date: end,
      is_active: true,
      updatedAt: new Date(),
    });

    return this.findByCompany(companyId, trx);
  }

  /**
   * Find subscription by company (supports transactions)
   * @param {string} companyId - Company ID
   * @param {object} trx - Optional Knex transaction
   */
  static async findByCompany(companyId, trx = null) {
    const query = db(this.table).where({ company_id: companyId }).first();
    if (trx) query.transacting(trx);
    return query;
  }

  /**
   * Get tier configuration for subscription
   * @returns {object} Tier configuration
   */
  getTierConfig() {
    return getTierConfig(this.tier);
  }

  /**
   * Check if feature is enabled for this subscription
   * @param {string} featureCategory - Feature category
   * @param {string} featureName - Feature name
   * @returns {boolean} Feature enabled status
   */
  isFeatureEnabled(featureCategory, featureName) {
    return isFeatureEnabled(this.tier, featureCategory, featureName);
  }

  /**
   * Get all features for this subscription tier
   * @returns {object} All features
   */
  getFeatures() {
    return this.getTierConfig().features;
  }

  /**
   * Check if subscription is expired
   * @returns {boolean} Expired status
   */
  isExpired() {
    if (!this.end_date) return false;
    return new Date() > new Date(this.end_date);
  }

  /**
   * Check if subscription is expiring soon (within 7 days)
   * @param {number} daysThreshold - Days threshold (default: 7)
   * @returns {boolean} Expiring soon status
   */
  isExpiringSoon(daysThreshold = 7) {
    if (!this.end_date || !this.is_active) return false;

    const now = new Date();
    const endDate = new Date(this.end_date);
    const daysUntilExpiry = (endDate - now) / (1000 * 60 * 60 * 24);

    return daysUntilExpiry > 0 && daysUntilExpiry <= daysThreshold;
  }

  /**
   * Get days remaining until expiry
   * @returns {number} Days remaining (negative if expired)
   */
  getDaysRemaining() {
    if (!this.end_date) return Infinity;

    const now = new Date();
    const endDate = new Date(this.end_date);
    return Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
  }

  /**
   * Get all active subscriptions due for "Expiring Soon" alert (2 days before)
   */
  static async getExpiringSoon(daysToExpiry = 2) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysToExpiry);
    const dateString = targetDate.toISOString().split('T')[0];

    return db(this.table)
      .where("is_active", true)
      .whereRaw("DATE(end_date) = ?", [dateString]);
  }

  /**
   * Get all subscriptions that have been expired for exactly X days (grace period)
   */
  static async getGracePeriodExpired(daysAfterExpiry = 3) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - daysAfterExpiry);
    const dateString = targetDate.toISOString().split('T')[0];

    return db(this.table)
      .where("is_active", true)
      .whereRaw("DATE(end_date) = ?", [dateString]);
  }

  /**
   * Get all subscriptions due for auto-renewal check (Pivoted to explicit checks)
   * @returns {Promise<Array>} List of subscriptions
   */
  static async getDueRenewals() {
    return db(this.table)
      .where("is_active", true)
      .andWhere("end_date", "<=", new Date())
      .whereRaw("(last_billing_attempt IS NULL OR last_billing_attempt < ?)", [new Date(Date.now() - 24 * 60 * 60 * 1000)]);
  }
}

module.exports = Subscription;
