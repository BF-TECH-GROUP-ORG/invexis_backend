const db = require("../config");
const { v4: uuidv4 } = require("uuid");
const { TIERS, normalizeTier } = require("../constants/tiers");

class Company {
  static table = "companies";
  constructor(data) {
    this.id = uuidv4();
    this.name = data.name;
    this.domain = data.domain || null;
    this.email = data.email || null;
    this.phone = data.phone || null;
    this.country = data.country || null;
    this.city = data.city || null;
    this.coordinates = data.coordinates || null;
    this.tier = normalizeTier(data.tier) || TIERS.BASIC;
    this.category_ids = data.category_ids || [];
    this.status = data.status || "pending_verification";
    this.company_admin_id = data.company_admin_id || null; // Primary company admin user
    this.metadata =
      data.metadata || {
        verification: {
          status: "pending",
          documents: [],
        },
      };
    this.createdBy = data.createdBy || null;
    this.updatedBy = data.updatedBy || null;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  static async create(data) {
    const company = new Company(data);
    await db(this.table).insert(company);
    return company;
  }
  //finding company by id of the company
  static async findCompanyById(id) {
    return await db(this.table).where("id", id).first();
  }
  //example of domain: invexis.com,
  static async findCompanyByDomain(domain) {
    return await db(this.table).where("domain", domain).first();
  }
  static async updateCompany(id, data) {
    await db(this.table).where("id", id).update(data);
    return await this.findCompanyById(id);
  }
  static async deleteCompany(id, actor) {
    await db(this.table)
      .where("id", id)
      .update({ isDeleted:true, updatedAt: new Date(), updatedBy: actor });
  }
  static async changeCompanyStatus(id, status, actor) {
    await db(this.table)
      .where("id", id)
      .update({ status, updatedAt: new Date(), updatedBy: actor });
  }
  static async changeTier(id, tier, actor) {
    await db(this.table)
      .where("id", id)
      .update({ tier, updatedAt: new Date(), updatedBy: actor });
  }
  static async findAllCompanies({ status, tier, limit = 50, offset = 0 } = {}) {
    let query = db(this.table).select("*").limit(limit).offset(offset);
    if (status) query = query.where({ status });
    if (tier) query = query.where({ tier });
    return query;
  }
  static async reactivateCompany(id, actor) {
    await db(this.table).where({ id }).update({
      status: "active",
      updatedAt: new Date(),
      updatedBy: actor,
    });
    return this.findCompanyById(id);
  }
  static async existsByDomain(domain) {
    const company = await db(this.table).where({ domain }).first();
    return !!company;
  }

  static async existsByName(name) {
    const company = await db(this.table).where({ name }).first();
    return !!company;
  }
  static async getActiveCompanies() {
    return db(this.table).where({ status: "active" }).select("*");
  }
  static async getCompaniesByTier(tier) {
    return db(this.table)
      .where({ tier })
      .andWhereNot({ status: "deleted" })
      .select("*");
  }

  /**
   * Find companies that have at least one of the specified category IDs
   * Uses PostgreSQL array overlap operator (@>)
   * @param {Array<string>} categoryIds - Array of category IDs to search for
   * @param {Object} options - Additional query options (status, tier, limit, offset)
   * @returns {Promise<Array>} - Array of companies
   */
  static async findCompaniesByCategories(categoryIds, options = {}) {
    const { status, tier, limit = 50, offset = 0 } = options;

    let query = db(this.table)
      .select("*")
      .whereRaw("category_ids && ARRAY[?]::text[]", [categoryIds])
      .limit(limit)
      .offset(offset);

    if (status) query = query.where({ status });
    if (tier) query = query.where({ tier });

    return query;
  }

  /**
   * Find companies that have ALL of the specified category IDs
   * Uses PostgreSQL array contains operator (@>)
   * @param {Array<string>} categoryIds - Array of category IDs that must all be present
   * @param {Object} options - Additional query options (status, tier, limit, offset)
   * @returns {Promise<Array>} - Array of companies
   */
  static async findCompaniesByAllCategories(categoryIds, options = {}) {
    const { status, tier, limit = 50, offset = 0 } = options;

    let query = db(this.table)
      .select("*")
      .whereRaw("category_ids @> ARRAY[?]::text[]", [categoryIds])
      .limit(limit)
      .offset(offset);

    if (status) query = query.where({ status });
    if (tier) query = query.where({ tier });

    return query;
  }

  /**
   * Add category IDs to a company
   * @param {string} id - Company ID
   * @param {Array<string>} categoryIds - Category IDs to add
   * @param {string} actor - User ID performing the action
   * @returns {Promise<Object>} - Updated company
   */
  static async addCategories(id, categoryIds, actor) {
    await db(this.table)
      .where("id", id)
      .update({
        category_ids: db.raw("array_cat(category_ids, ARRAY[?]::text[])", [categoryIds]),
        updatedAt: new Date(),
        updatedBy: actor,
      });
    return this.findCompanyById(id);
  }

  /**
   * Remove category IDs from a company
   * @param {string} id - Company ID
   * @param {Array<string>} categoryIds - Category IDs to remove
   * @param {string} actor - User ID performing the action
   * @returns {Promise<Object>} - Updated company
   */
  static async removeCategories(id, categoryIds, actor) {
    await db(this.table)
      .where("id", id)
      .update({
        category_ids: db.raw(
          "ARRAY(SELECT unnest(category_ids) EXCEPT SELECT unnest(ARRAY[?]::text[]))",
          [categoryIds]
        ),
        updatedAt: new Date(),
        updatedBy: actor,
      });
    return this.findCompanyById(id);
  }

  /**
   * Set (replace) category IDs for a company
   * @param {string} id - Company ID
   * @param {Array<string>} categoryIds - New category IDs
   * @param {string} actor - User ID performing the action
   * @returns {Promise<Object>} - Updated company
   */
  static async setCategories(id, categoryIds, actor) {
    await db(this.table)
      .where("id", id)
      .update({
        category_ids: categoryIds,
        updatedAt: new Date(),
        updatedBy: actor,
      });
    return this.findCompanyById(id);
  }

  toPublicJSON() {
    const {
      id,
      name,
      domain,
      email,
      phone,
      country,
      city,
      tier,
      status,
      category_ids,
      metadata,
    } = this;
    return {
      id,
      name,
      domain,
      email,
      phone,
      country,
      city,
      tier,
      status,
      category_ids,
      metadata,
    };
  }
}

module.exports = Company;
