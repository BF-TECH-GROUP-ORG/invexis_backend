const db = require("../config");

/**
 * User Model - Read-only replica of user data from auth-service
 * Synchronized via events for fast local queries
 */
class User {
    static table = "users";

    /**
     * Upsert (insert or update) user data from auth-service event
     * @param {Object} userData - User data from event
     */
    static async upsert(userData) {
        const record = {
            id: userData.userId || userData.id,
            first_name: userData.firstName,
            last_name: userData.lastName,
            email: userData.email,
            phone: userData.phone,
            profile_picture: userData.profilePicture || userData.profile_picture,
            address: JSON.stringify(userData.address || {}),
            role: userData.role,
            position: userData.position,
            updated_at: new Date(),
            synced_at: new Date(),
        };

        // Remove undefined values
        Object.keys(record).forEach(key =>
            record[key] === undefined && delete record[key]
        );

        // Upsert: insert or update if exists
        const exists = await db(this.table).where({ id: record.id }).first();

        if (exists) {
            await db(this.table).where({ id: record.id }).update(record);
        } else {
            record.created_at = new Date();
            await db(this.table).insert(record);
        }

        return this.findById(record.id);
    }

    /**
     * Find user by ID
     */
    static async findById(userId) {
        return db(this.table).where({ id: userId }).first();
    }

    /**
     * Find users by IDs (bulk)
     */
    static async findByIds(userIds) {
        return db(this.table).whereIn('id', userIds).select('*');
    }

    /**
     * Delete user record
     */
    static async delete(userId) {
        return db(this.table).where({ id: userId }).del();
    }

    /**
     * Get users by company ID (via join with company_role_assignments)
     */
    static async getByCompany(companyId) {
        return db(this.table)
            .join('company_role_assignments', 'users.id', 'company_role_assignments.user_id')
            .join('company_roles', 'company_role_assignments.role_id', 'company_roles.id')
            .where('company_role_assignments.company_id', companyId)
            .select(
                'users.*',
                'company_role_assignments.status as assignment_status',
                'company_role_assignments.assigned_at',
                'company_roles.name as role_name',
                'company_roles.domain as role_domain'
            );
    }
}

module.exports = User;
