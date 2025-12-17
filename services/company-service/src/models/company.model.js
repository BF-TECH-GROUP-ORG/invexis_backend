const db = require("../config");
const { v4: uuidv4 } = require("uuid");
const { TIERS, normalizeTier } = require("../constants/tiers");

class Company {
  static table = "companies";
  constructor(data) {
    // ⚡ FAST: Minimal object creation, skip unnecessary calculations
    this.id = data.id || uuidv4();
    this.name = data.name;
    this.domain = data.domain || null;
    this.email = data.email || null;
    this.phone = data.phone || null;
    this.country = data.country || null;
    this.city = data.city || null;
    this.coordinates = data.coordinates || null;
    this.tier = data.tier || TIERS.BASIC;
    this.category_ids = data.category_ids || [];
    this.status = data.status || "pending_verification";
    this.company_admin_id = data.company_admin_id || null;
    this.metadata = data.metadata || {
      verification: {
        status: "pending",
        documents: [],
      },
    };
    this.createdBy = data.createdBy || null;
    this.updatedBy = data.updatedBy || null;
    // ⚡ ULTRA-FAST: Use provided dates or now
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  static async create(data, trx = null) {
    const company = new Company(data);
    const query = trx ? trx(this.table) : db(this.table);
    await query.insert(company);
    return company;
  }

  /**
   * ⚡ FAST: Raw insert without instantiation overhead
   * Use for bulk operations where validation already done
   */
  static async fastInsert(data, trx = null) {
    const query = trx ? trx(this.table) : db(this.table);
    const result = await query.insert(data).returning('*');
    return result[0] || result;
  }

  /**
   * ⚡ FAST: Batch insert multiple companies at once
   */
  static async createBatch(companies, trx = null) {
    if (companies.length === 0) return [];
    const query = trx ? trx(this.table) : db(this.table);
    return await query.insert(companies).returning('*');
  }

  //finding company by id of the company
  static async findCompanyById(id) {
    return await db(this.table).where("id", id).first();
  }
  
  //example of domain: invexis.com,
  static async findCompanyByDomain(domain) {
    return await db(this.table).where("domain", domain).first();
  }
  
  static async updateCompany(id, data, trx = null) {
    const query = trx ? trx(this.table) : db(this.table);
    await query.where("id", id).update(data);
    return await this.findCompanyById(id);
  }
  
  static async deleteCompany(id, actor, trx = null) {
    const query = trx ? trx(this.table) : db(this.table);
    await query
      .where("id", id)
      .update({ isDeleted: true, updatedAt: new Date(), updatedBy: actor });
  }
  
  static async changeCompanyStatus(id, status, actor, trx = null) {
    const query = trx ? trx(this.table) : db(this.table);
    await query
      .where("id", id)
      .update({ status, updatedAt: new Date(), updatedBy: actor });
  }
  
  static async changeTier(id, tier, actor, trx = null) {
    const query = trx ? trx(this.table) : db(this.table);
    await query
      .where("id", id)
      .update({ tier, updatedAt: new Date(), updatedBy: actor });
  }
  
  // Optimized: Select only essential columns for list operations
  static async findAllCompanies({ status, tier, limit = 50, offset = 0 } = {}) {
    let query = db(this.table)
      .select("id", "name", "domain", "email", "phone", "status", "tier", "country", "city", "category_ids", "createdAt", "updatedAt")
      .limit(limit)
      .offset(offset);
    if (status) query = query.where({ status });
    if (tier) query = query.where({ tier });
    return query;
  }
  
  static async reactivateCompany(id, actor, trx = null) {
    const query = trx ? trx(this.table) : db(this.table);
    await query.where({ id }).update({
      status: "active",
      updatedAt: new Date(),
      updatedBy: actor,
    });
    return this.findCompanyById(id);
  }
  
  static async existsByDomain(domain) {
    if (!domain) return false;
    const result = await db(this.table)
      .where({ domain })
      .count('* as cnt')
      .first();
    return (result?.cnt || 0) > 0;
  }

  static async existsByName(name) {
    if (!name) return false;
    const result = await db(this.table)
      .where({ name })
      .count('* as cnt')
      .first();
    return (result?.cnt || 0) > 0;
  }

  /**
   * ⚡ ULTRA-FAST: Check both domain and name in single query
   */
  static async existsByDomainOrName(domain, name) {
    if (!domain && !name) return false;
    let query = db(this.table);
    if (domain && name) {
      query = query.where(db.raw('domain = ? OR name = ?', [domain, name]));
    } else if (domain) {
      query = query.where({ domain });
    } else if (name) {
      query = query.where({ name });
    }
    const result = await query.count('* as cnt').first();
    return (result?.cnt || 0) > 0;
  }
  static async getActiveCompanies() {
    return db(this.table)
      .where({ status: "active" })
      .select("id", "name", "domain", "email", "tier", "country", "city", "createdAt", "updatedAt");
  }
  
  static async getCompaniesByTier(tier) {
    return db(this.table)
      .where({ tier })
      .andWhereNot({ status: "deleted" })
      .select("id", "name", "domain", "email", "tier", "country", "city", "createdAt", "updatedAt");
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
      .select("id", "name", "domain", "email", "tier", "category_ids", "country", "city", "createdAt", "updatedAt")
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
      .select("id", "name", "domain", "email", "tier", "category_ids", "country", "city", "createdAt", "updatedAt")
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
