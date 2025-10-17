const db = require("../config");
const { v4: uuidv4 } = require("uuid");

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
    this.tier = data.tier || "basic";
    this.status = data.status || "active";
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
      .update({ status: "deleted", updatedAt: new Date(), updatedBy: actor });
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
  toPublicJSON() {
    const { id, name, domain, email, phone, country, city, tier, status } =
      this;
    return { id, name, domain, email, phone, country, city, tier, status };
  }
}

module.exports=Company;
