const db = require("../config");
const { v4: uuidv4 } = require("uuid");

class CompanyUser {
  static table = "company_users";

  constructor(data) {
    this.id = uuidv4();
    this.company_id = data.company_id;
    this.user_id = data.user_id;
    this.role_id = data.role_id;
    this.status = data.status || "active"; // active | suspended
    this.createdBy = data.createdBy || null;
    this.updatedBy = data.updatedBy || null;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  // ✅ Assign a user to a company with a role
  static async assign(data) {
    const record = new CompanyUser(data);
    await db(this.table).insert(record);
    return record;
  }

  // ✅ Find all users in a company
  static async findByCompany(companyId) {
    return db(this.table).where({ company_id: companyId }).select("*");
  }

  // ✅ Find all companies a user belongs to
  static async findByUser(userId) {
    return db(this.table).where({ user_id: userId }).select("*");
  }

  // ✅ Find specific link
  static async findByUserAndCompany(userId, companyId) {
    return db(this.table)
      .where({ user_id: userId, company_id: companyId })
      .first();
  }

  // ✅ Change role
  static async updateRole(companyId, userId, roleId, actor) {
    await db(this.table)
      .where({ company_id: companyId, user_id: userId })
      .update({
        role_id: roleId,
        updatedBy: actor,
        updatedAt: new Date(),
      });
    return this.findByUserAndCompany(userId, companyId);
  }

  // ✅ Suspend a user in a company (not delete)
  static async suspend(companyId, userId, actor) {
    await db(this.table)
      .where({ company_id: companyId, user_id: userId })
      .update({
        status: "suspended",
        updatedBy: actor,
        updatedAt: new Date(),
      });
    return this.findByUserAndCompany(userId, companyId);
  }

  // ✅ Remove user from company
  static async remove(companyId, userId) {
    await db(this.table)
      .where({ company_id: companyId, user_id: userId })
      .del();
    return true;
  }
}

module.exports = CompanyUser;
