const db = require("../config");
const { v4: uuidv4 } = require("uuid");

class Role {
  static table = "roles";

  constructor(data) {
    this.id = uuidv4();
    this.company_id = data.company_id; // mandatory for multi-tenancy
    this.name = data.name;
    this.permissions = JSON.stringify(data.permissions || []); // store as JSON
    this.createdBy = data.createdBy || null;
    this.updatedBy = data.updatedBy || null;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  // ✅ Create a role
  static async create(data) {
    const role = new Role(data);
    await db(this.table).insert(role);
    return role;
  }

  // ✅ Find all roles for a company
  static async findByCompany(companyId) {
    return db(this.table).where({ company_id: companyId }).select("*");
  }

  // ✅ Find single role by ID
  static async findById(id) {
    return db(this.table).where({ id }).first();
  }

  // ✅ Find role by name (within a company)
  static async findByName(companyId, name) {
    return db(this.table).where({ company_id: companyId, name }).first();
  }

  // ✅ Update role (e.g., rename or change permissions)
  static async update(id, data) {
    const updatedData = {
      ...data,
      permissions: JSON.stringify(data.permissions || []),
      updatedAt: new Date(),
      updatedBy: data.updatedBy,
    };
    await db(this.table).where({ id }).update(updatedData);
    return this.findById(id);
  }

  // ✅ Delete a role
  static async delete(id) {
    await db(this.table).where({ id }).del();
    return true;
  }

  // ✅ Check if a role already exists in a company
  static async exists(companyId, name) {
    const found = await db(this.table)
      .where({ company_id: companyId, name })
      .first();
    return !!found;
  }

  // ✅ Assign permissions programmatically (append)
  static async addPermission(id, permission) {
    const role = await this.findById(id);
    const currentPermissions = JSON.parse(role.permissions || "[]");
    if (!currentPermissions.includes(permission)) {
      currentPermissions.push(permission);
      await db(this.table)
        .where({ id })
        .update({
          permissions: JSON.stringify(currentPermissions),
          updatedAt: new Date(),
        });
    }
    return this.findById(id);
  }

  // ✅ Remove a permission
  static async removePermission(id, permission) {
    const role = await this.findById(id);
    let currentPermissions = JSON.parse(role.permissions || "[]");
    currentPermissions = currentPermissions.filter((p) => p !== permission);
    await db(this.table)
      .where({ id })
      .update({
        permissions: JSON.stringify(currentPermissions),
        updatedAt: new Date(),
      });
    return this.findById(id);
  }
}

module.exports = Role;
