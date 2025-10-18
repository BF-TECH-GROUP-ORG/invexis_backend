const db = require("../config");
const { v4: uuidv4 } = require("uuid");

class Subscription {
  static table = "subscriptions";

  constructor(data) {
    this.id = uuidv4();
    this.company_id = data.company_id;
    this.tier = data.tier || "basic";
    this.start_date = data.start_date || new Date();
    this.end_date = data.end_date || null;
    this.is_active = data.is_active !== undefined ? data.is_active : true;
    this.amount = data.amount || 0;
    this.currency = data.currency || "RWF";
    this.payment_reference = data.payment_reference || null;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  // ✅ Create subscription record
  static async create(data) {
    const sub = new Subscription(data);
    await db(this.table).insert(sub);
    return sub;
  }

  // ✅ Get subscription by company
  static async findByCompany(companyId) {
    return db(this.table).where({ company_id: companyId }).first();
  }

  // ✅ Update subscription
  static async update(companyId, data) {
    await db(this.table)
      .where({ company_id: companyId })
      .update({
        ...data,
        updatedAt: new Date(),
      });
    return this.findByCompany(companyId);
  }

  // ✅ Deactivate subscription
  static async deactivate(companyId) {
    await db(this.table)
      .where({ company_id: companyId })
      .update({ is_active: false, updatedAt: new Date() });
    return this.findByCompany(companyId);
  }

  // ✅ Renew subscription
  static async renew(companyId, tier, amount, durationDays) {
    const start = new Date();
    const end = new Date(start);
    end.setDate(start.getDate() + durationDays);

    await db(this.table).where({ company_id: companyId }).update({
      tier,
      amount,
      start_date: start,
      end_date: end,
      is_active: true,
      updatedAt: new Date(),
    });

    return this.findByCompany(companyId);
  }
}

module.exports = Subscription;
