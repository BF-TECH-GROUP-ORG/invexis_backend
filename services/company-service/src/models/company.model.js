const db = require("../config");
const { v4: uuidv4 } = require("uuid");
const { TIERS } = require("/app/shared/constants/tiers");

class Company {
  static table = "companies";

  constructor(data) {
    // ⚡ FAST: Minimal object creation
    this.id = data.id || uuidv4();

    /* =======================
       BASIC COMPANY INFO
    ======================= */
    this.name = data.name;
    this.domain = data.domain || null;
    this.email = data.email || null;
    this.phone = data.phone || null;
    this.country = data.country || null;
    this.city = data.city || null;

    /* =======================
       COMPANY STATUS & ADMIN
    ======================= */
    this.status = data.status || "pending_verification";
    this.company_admin_id = data.company_admin_id || null;
    this.category_ids = data.category_ids || [];
    this.tier = data.tier || TIERS.BASIC;

    /* =======================
       PAYMENT PROFILE (STRIPE ONLY)
    ======================= */
    this.payment_profile = data.payment_profile || {
      stripe: {
        connectAccountId: null,             // Stripe Express/Custom account ID (acct_xxx)
        chargesEnabled: false,              // Enabled after account is fully onboarded
        payoutsEnabled: false,              // Enabled after account is fully onboarded
        currency: data.currency || "RWF",   // Currency for charges & payouts
        paymentMethodId: null,               // Stripe PaymentMethod ID (pm_xxx)
      }
    };


    /* =======================
       PAYMENT PHONES (MOBILE MONEY)
    ======================= */
    // Array of objects: { provider: 'MTN'|'AIRTEL'|'MPESA', phoneNumber: string, country: string, currency: string, enabled: boolean }
    this.payment_phones = data.payment_phones || [];

    /* =======================
       COMPANY ATTRIBUTES
    ======================= */
    this.is_bank = data.is_bank !== undefined ? data.is_bank : false;

    /* =======================
       SUBSCRIPTION / TIERS
    ======================= */
    this.subscription_id = data.subscription_id || null;

    /* =======================
       COMPLIANCE & AUDIT
    ======================= */
    this.compliance = data.compliance || {
      kycStatus: "pending", // pending | verified | rejected
      verifiedAt: null,
    };

    /* =======================
       METADATA
    ======================= */
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

  /* =======================
     CRUD OPERATIONS
  ======================= */

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
    const company = await db(this.table).where("id", id).first();
    if (!company) return null;

    // Populate subscription
    const subscription = await db("subscriptions").where({ company_id: id }).first();
    return { ...company, subscription: subscription || null };
  }

  //example of domain: invexis.com,
  static async findCompanyByDomain(domain) {
    const company = await db(this.table).where("domain", domain).first();
    if (!company) return null;

    // Populate subscription
    const subscription = await db("subscriptions").where({ company_id: company.id }).first();
    return { ...company, subscription: subscription || null };
  }

  static async updateCompany(id, data, trx = null) {
    const query = trx ? trx(this.table) : db(this.table);

    // ⚡ EDGE CASE: Explicitly stringify JSON fields if they are objects
    const formattedData = { ...data };
    const jsonFields = ['payment_profile', 'payment_phones', 'compliance', 'metadata', 'category_ids'];

    jsonFields.forEach(field => {
      if (formattedData[field] && typeof formattedData[field] === 'object') {
        formattedData[field] = JSON.stringify(formattedData[field]);
      }
    });

    await query.where("id", id).update({ ...formattedData, updatedAt: new Date() });
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
      .update({
        tier,
        updatedAt: new Date(),
        updatedBy: actor
      });
    return this.findCompanyById(id);
  }

  // Optimized: Select only essential columns for list operations
  static async findAllCompanies({ status, tier, limit = 50, offset = 0 } = {}) {
    let query = db(this.table)
      .select("id", "name", "domain", "email", "status", "tier", "is_bank", "country", "city", "category_ids", "payment_profile", "payment_phones", "subscription_id", "createdAt", "updatedAt")
      .limit(limit)
      .offset(offset);
    if (status) query = query.where({ status });
    if (tier) query = query.where({ tier });

    const companies = await query;
    return this.populateSubscriptions(companies);
  }

  /**
   * ⚡ ULTRA-FAST: Batch populate subscriptions for a list of companies
   */
  static async populateSubscriptions(companies) {
    if (!Array.isArray(companies) || companies.length === 0) return companies;

    const companyIds = companies.map(c => c.id);
    const subscriptions = await db("subscriptions").whereIn("company_id", companyIds);

    const subMap = subscriptions.reduce((acc, sub) => {
      acc[sub.company_id] = sub;
      return acc;
    }, {});

    return companies.map(c => ({
      ...c,
      subscription: subMap[c.id] || null
    }));
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
    const companies = await db(this.table)
      .where({ status: "active" })
      .select("id", "name", "domain", "email", "tier", "is_bank", "country", "city", "payment_profile", "payment_phones", "subscription_id", "createdAt", "updatedAt");
    return this.populateSubscriptions(companies);
  }


  static async getCompaniesByTier(tier) {
    const companies = await db(this.table)
      .where({ tier })
      .andWhereNot({ status: "deleted" })
      .select("id", "name", "domain", "email", "tier", "country", "city", "payment_profile", "payment_phones", "subscription_id", "createdAt", "updatedAt");
    return this.populateSubscriptions(companies);
  }

  /**
   * Find companies that have at least one of the specified category IDs
   */
  static async findCompaniesByCategories(categoryIds, options = {}) {
    const { status, tier, limit = 50, offset = 0 } = options;

    let query = db(this.table)
      .select("id", "name", "domain", "email", "tier", "category_ids", "country", "city", "payment_profile", "payment_phones", "subscription_id", "createdAt", "updatedAt")
      .whereRaw("category_ids ?| ARRAY[?]::text[]", [categoryIds])
      .limit(limit)
      .offset(offset);

    if (status) query = query.where({ status });
    if (tier) query = query.where({ tier });

    const companies = await query;
    return this.populateSubscriptions(companies);
  }

  /**
   * Find companies that have ALL of the specified category IDs
   */
  static async findCompaniesByAllCategories(categoryIds, options = {}) {
    const { status, tier, limit = 50, offset = 0 } = options;

    let query = db(this.table)
      .select("id", "name", "domain", "email", "tier", "category_ids", "country", "city", "payment_profile", "payment_phones", "subscription_id", "createdAt", "updatedAt")
      .whereRaw("category_ids @> ?::jsonb", [JSON.stringify(categoryIds)])
      .limit(limit)
      .offset(offset);

    if (status) query = query.where({ status });
    if (tier) query = query.where({ tier });

    const companies = await query;
    return this.populateSubscriptions(companies);
  }

  /**
   * Add category IDs to a company
   */
  static async addCategories(id, categoryIds, actor) {
    await db(this.table)
      .where("id", id)
      .update({
        category_ids: db.raw("(SELECT jsonb_agg(DISTINCT val) FROM (SELECT jsonb_array_elements(category_ids) val UNION SELECT jsonb_array_elements(?::jsonb)) t)", [JSON.stringify(categoryIds)]),
        updatedAt: new Date(),
        updatedBy: actor,
      });
    return this.findCompanyById(id);
  }

  /**
   * Remove category IDs from a company
   */
  static async removeCategories(id, categoryIds, actor) {
    await db(this.table)
      .where("id", id)
      .update({
        category_ids: db.raw("(SELECT COALESCE(jsonb_agg(val), '[]'::jsonb) FROM jsonb_array_elements(category_ids) val WHERE NOT (val <@ ?::jsonb))", [JSON.stringify(categoryIds)]),
        updatedAt: new Date(),
        updatedBy: actor,
      });
    return this.findCompanyById(id);
  }

  /**
   * Set (replace) category IDs for a company
   */
  static async setCategories(id, categoryIds, actor) {
    await db(this.table)
      .where("id", id)
      .update({
        category_ids: JSON.stringify(categoryIds),
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
      country,
      city,
      tier,
      status,
      category_ids,
      payment_profile,
      payment_phones,
      subscription_id,
      compliance,
      metadata,
    } = this;
    return {
      id,
      name,
      domain,
      email,
      country,
      city,
      tier,
      status,
      category_ids,
      payment_profile,
      payment_phones,
      subscription_id,
      compliance,
      metadata,
    };
  }
}

module.exports = Company;
