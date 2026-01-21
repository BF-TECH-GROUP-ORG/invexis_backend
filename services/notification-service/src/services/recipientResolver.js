const axios = require('axios');
const { AUTH_ROLES, DEPARTMENTS, ROLE_DISPLAY_NAMES, DEPARTMENT_DISPLAY_NAMES } = require('../constants/roles');
const logger = require('../utils/logger');

class RecipientResolver {
    constructor() {
        // Ensure base URL doesn't have trailing slash or duplicate path if possible
        const rawAuthUrl = process.env.AUTH_SERVICE_URL || 'http://auth-service:8001';
        this.authServiceUrl = rawAuthUrl.replace(/\/$/, '').replace(/\/auth$/, ''); // Strip trailing slash and /auth if present

        this.cache = new Map(); // Simple in-memory cache
        this.cacheTTL = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Resolve recipients by role for a given event
     * @param {string} eventType - Event type (e.g., 'shop.created')
     * @param {Object} data - Event data
     * @returns {Promise<Object>} - { role: [userId1, userId2, ...] }
     */
    async resolveByRole(eventType, data) {
        const mapping = this.getRoleMapping(eventType);

        if (!mapping || !mapping.roles || mapping.roles.length === 0) {
            logger.warn(`⚠️ No role mapping defined for ${eventType}`);
            return {};
        }

        logger.info(`🔍 Resolving recipients for ${eventType}`, {
            roles: mapping.roles,
            companyId: data.companyId,
            shopId: data.shopId
        });

        const recipients = {};

        for (const roleSpec of mapping.roles) {
            try {
                // Handle both string roles and department-based objects
                const isObject = typeof roleSpec === 'object' && roleSpec.role;
                const role = isObject ? roleSpec.role : roleSpec;
                const department = isObject ? roleSpec.department : null;

                // Add department to context if specified
                const context = department ? { ...data, department } : data;

                logger.debug(`🧪 Resolving role: ${role}`, {
                    department,
                    companyId: context.companyId,
                    shopId: context.shopId
                });

                const userIds = await this.getUsersByRole(role, context, eventType);
                if (userIds && userIds.length > 0) {
                    // Use descriptive key for recipients
                    const recipientKey = department
                        ? `${role}_${department}`
                        : role;
                    recipients[recipientKey] = userIds;

                    const displayName = department
                        ? `${DEPARTMENT_DISPLAY_NAMES[department]} ${ROLE_DISPLAY_NAMES[role]}`
                        : ROLE_DISPLAY_NAMES[role];
                    logger.info(`✅ Found ${userIds.length} ${displayName}(s) for ${eventType}`);
                } else {
                    logger.debug(`∅ No recipients found for role: ${role}`, { department });
                }
            } catch (error) {
                logger.error(`❌ Failed to resolve ${roleSpec} for ${eventType}:`, error.message);
            }
        }

        return recipients;
    }

    /**
     * Query auth-service for users by role and context
     * @param {string} role - User role (from AUTH_ROLES)
     * @param {Object} context - { companyId, shopId, userId, etc. }
     * @param {string} eventType - Event type for special handling
     * @returns {Promise<string[]>} - Array of user IDs
     */
    async getUsersByRole(role, context, eventType) {
        const { companyId, shopId, userId, adminId, managerId, affectedUserId } = context;

        // Special case: AFFECTED_USER (the user directly involved in the event)
        if (role === 'AFFECTED_USER') {
            const id = affectedUserId || userId || adminId;

            // If no registered user found, but it's a debt event with a phone number, 
            // return 'external' to trigger the external notification flow.
            if (!id && eventType && eventType.startsWith('debt.') && (context.phone || context.customerPhone)) {
                logger.debug(`👤 External recipient identified for ${eventType}`);
                return ['external'];
            }

            return id ? [id] : [];
        }

        // Special case: Event provides explicit role-based IDs
        if (role === AUTH_ROLES.COMPANY_ADMIN && adminId) {
            return [adminId];
        }

        // Query auth-service for users by role
        logger.debug(`📡 Querying by role: ${role}`, { companyId, shopId });

        switch (role) {
            case AUTH_ROLES.SUPER_ADMIN:
                return await this.getSuperAdmins();

            case AUTH_ROLES.COMPANY_ADMIN:
                if (!companyId) {
                    logger.warn(`⚠️ No companyId provided for COMPANY_ADMIN resolution`);
                    return [];
                }
                return await this.getCompanyAdmins(companyId);

            case AUTH_ROLES.WORKER:
                if (!shopId && !companyId) {
                    logger.warn(`⚠️ No shopId/companyId for WORKER resolution`);
                    return [];
                }
                // Support department filtering from context
                const department = context.department;
                return await this.getWorkers(companyId, shopId, department);

            default:
                logger.warn(`⚠️ Unknown role: ${role}`);
                return [];
        }
    }

    /**
     * Get all super admins
     * @returns {Promise<string[]>}
     */
    async getSuperAdmins() {
        const cacheKey = 'super_admins';
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        try {
            const response = await axios.get(`${this.authServiceUrl}/auth/users`, {
                params: { role: AUTH_ROLES.SUPER_ADMIN },
                headers: { 'X-Internal-Request': 'true' },
                timeout: 5000
            });

            // Handle { ok: true, users: [...] } format from production auth-service
            const users = response.data.users || response.data || [];
            const userIds = Array.isArray(users) ? users.map(u => u._id || u.id) : [];

            this.setCache(cacheKey, userIds);
            return userIds;
        } catch (error) {
            const errorMsg = error.response?.data?.error || error.message;
            logger.error('Failed to fetch super admins:', errorMsg);
            return [];
        }
    }

    /**
     * Get company admins for a specific company
     * @param {string} companyId
     * @returns {Promise<string[]>}
     */
    async getCompanyAdmins(companyId) {
        const cacheKey = `company_admins:${companyId}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        try {
            const response = await axios.get(`${this.authServiceUrl}/auth/users`, {
                params: {
                    role: AUTH_ROLES.COMPANY_ADMIN,
                    companies: companyId
                },
                headers: { 'X-Internal-Request': 'true' },
                timeout: 5000
            });

            const users = response.data.users || response.data || [];
            const userIds = Array.isArray(users) ? users.map(u => u._id || u.id) : [];

            this.setCache(cacheKey, userIds);
            return userIds;
        } catch (error) {
            const errorMsg = error.response?.data?.error || error.message;
            logger.error(`Failed to fetch company admins for ${companyId}:`, errorMsg);
            return [];
        }
    }



    /**
     * Get workers for a company or shop, optionally filtered by department
     * @param {string} companyId
     * @param {string} shopId
     * @param {string} department - Optional: 'sales' or 'management'
     * @returns {Promise<string[]>}
     */
    async getWorkers(companyId, shopId, department = null) {
        const cacheKey = `workers:${companyId}:${shopId}:${department || 'all'}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        try {
            const params = { role: AUTH_ROLES.WORKER };
            if (shopId) params.shops = shopId;
            else if (companyId) params.companies = companyId;
            // Auth service uses 'assignedDepartments' field (array)
            if (department) params.assignedDepartments = department;

            logger.debug(`🔍 Querying auth-service for workers:`, {
                url: `${this.authServiceUrl}/auth/users`,
                params,
                department
            });

            const response = await axios.get(`${this.authServiceUrl}/auth/users`, {
                params,
                headers: { 'X-Internal-Request': 'true' },
                timeout: 5000
            });

            logger.debug(`📦 Auth-service response:`, {
                status: response.status,
                dataKeys: Object.keys(response.data || {}),
                userCount: Array.isArray(response.data?.users) ? response.data.users.length : 0,
                firstUser: response.data?.users?.[0]?._id || 'none'
            });

            const users = response.data.users || response.data || [];
            const userIds = Array.isArray(users) ? users.map(u => u._id || u.id) : [];

            if (userIds.length === 0) {
                logger.warn(`⚠️ No workers found for query`, { params, department });
            } else {
                logger.info(`✅ Found ${userIds.length} worker(s)`, { userIds });
            }

            this.setCache(cacheKey, userIds);
            return userIds;
        } catch (error) {
            logger.error(`Failed to fetch workers:`, error.message);
            return [];
        }
    }

    /**
     * Define role mappings per event type
     * Maps event types to roles that should be notified
     */
    getRoleMapping(eventType) {
        const mappings = {
            // Company Events
            'company.created': { roles: [AUTH_ROLES.COMPANY_ADMIN] },
            'company.updated': { roles: [AUTH_ROLES.COMPANY_ADMIN] },
            'company.status.changed': { roles: [AUTH_ROLES.COMPANY_ADMIN] },
            'company.suspended': { roles: [AUTH_ROLES.COMPANY_ADMIN, AUTH_ROLES.SUPER_ADMIN] },
            'company.deleted': { roles: [AUTH_ROLES.COMPANY_ADMIN, AUTH_ROLES.SUPER_ADMIN] },
            'company.tierChanged': { roles: [AUTH_ROLES.COMPANY_ADMIN] },
            'company.allSuspended': { roles: [AUTH_ROLES.COMPANY_ADMIN, AUTH_ROLES.SUPER_ADMIN] },

            // Shop Events - Management department handles shop operations
            'shop.created': {
                roles: [
                    AUTH_ROLES.COMPANY_ADMIN,
                    { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }
                ]
            },
            'shop.updated': {
                roles: [AUTH_ROLES.COMPANY_ADMIN, { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }]
            },
            'shop.deleted': {
                roles: [
                    AUTH_ROLES.COMPANY_ADMIN,
                    { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }
                ]
            },
            'shop.statusChanged': {
                roles: [AUTH_ROLES.COMPANY_ADMIN, { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }]
            },

            // Inventory Events - Management department handles inventory
            'inventory.low_stock': {
                roles: [AUTH_ROLES.COMPANY_ADMIN, { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }]
            },
            'inventory.low.stock': {
                roles: [AUTH_ROLES.COMPANY_ADMIN, { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }]
            },
            'inventory.product.low_stock': {
                roles: [AUTH_ROLES.COMPANY_ADMIN, { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }]
            },
            'product.created': {
                roles: [
                    AUTH_ROLES.COMPANY_ADMIN,
                    { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }
                ]
            },
            'product.updated': {
                roles: [AUTH_ROLES.COMPANY_ADMIN, { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }]
            },
            'product.deleted': {
                roles: [
                    AUTH_ROLES.COMPANY_ADMIN,
                    { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }
                ]
            },
            'inventory.out_of_stock': {
                roles: [
                    { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT },
                    AUTH_ROLES.COMPANY_ADMIN
                ]
            },
            'inventory.out.of.stock': {
                roles: [
                    { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT },
                    AUTH_ROLES.COMPANY_ADMIN
                ]
            },
            'inventory.product.out_of_stock': {
                roles: [
                    { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT },
                    AUTH_ROLES.COMPANY_ADMIN
                ]
            },
            'inventory.stock.updated': {
                roles: [AUTH_ROLES.COMPANY_ADMIN, { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }]
            },
            'inventory.bulk.stock_in': {
                roles: [AUTH_ROLES.COMPANY_ADMIN, { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }]
            },
            'inventory.bulk.stock_out': {
                roles: [AUTH_ROLES.COMPANY_ADMIN, { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }]
            },
            'inventory.transfer.created': {
                roles: [AUTH_ROLES.COMPANY_ADMIN, { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }]
            },
            'inventory.transfer.bulk.intra': {
                roles: [AUTH_ROLES.COMPANY_ADMIN, { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }]
            },
            'inventory.transfer.bulk.cross.sent': {
                roles: [AUTH_ROLES.COMPANY_ADMIN, { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }]
            },
            'inventory.transfer.bulk.cross.received': {
                roles: [AUTH_ROLES.COMPANY_ADMIN, { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }]
            },
            'inventory.transfer.cross.sent': {
                roles: [AUTH_ROLES.COMPANY_ADMIN, { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }]
            },
            'inventory.transfer.cross.received': {
                roles: [AUTH_ROLES.COMPANY_ADMIN, { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }]
            },

            // Sales Events - Both departments get notified
            'sale.created': {
                roles: [
                    // Sales Workers: Only notify the person who made the sale (AFFECTED_USER logic)
                    // We achieve this by *removing* the broad department broadcast for Sales Dept
                    // and relying on "AFFECTED_USER" if we want to notify them, OR enforcing strict "what they did" means they don't even need a notification?
                    // "and of wht they did only" -> implies they SHOULD get a notification for their own action ("Success! Sale created")
                    'AFFECTED_USER',

                    // Management Workers: Receive all sales in their shop
                    { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT },

                    // Company Admins: Receive all sales in their company
                    AUTH_ROLES.COMPANY_ADMIN
                ]
            },
            'sale.updated': {
                roles: [
                    AUTH_ROLES.COMPANY_ADMIN,
                    { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }
                ]
            },
            'sale.completed': { roles: [AUTH_ROLES.COMPANY_ADMIN, AUTH_ROLES.WORKER] },
            'sale.deleted': {
                roles: [
                    AUTH_ROLES.COMPANY_ADMIN,
                    { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }
                ]
            },
            'sale.cancelled': {
                roles: [
                    { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT },
                    AUTH_ROLES.WORKER
                ]
            },
            'sale.refunded': {
                roles: [
                    AUTH_ROLES.COMPANY_ADMIN,
                    { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }
                ]
            },
            'sale.return.created': {
                roles: [
                    AUTH_ROLES.COMPANY_ADMIN,
                    { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }
                ]
            },

            // Payment Events
            'payment.success': { roles: [AUTH_ROLES.COMPANY_ADMIN, AUTH_ROLES.WORKER] },
            'payment.failed': { roles: [AUTH_ROLES.COMPANY_ADMIN, AUTH_ROLES.SUPER_ADMIN] },
            'payment.refunded': { roles: [AUTH_ROLES.COMPANY_ADMIN] },
            'subscription.expiring': { roles: [AUTH_ROLES.COMPANY_ADMIN] },
            'subscription.expired': { roles: [AUTH_ROLES.COMPANY_ADMIN, AUTH_ROLES.SUPER_ADMIN] },

            // Auth Events
            'user.created': { roles: ['AFFECTED_USER', AUTH_ROLES.COMPANY_ADMIN] },
            'user.verified': { roles: ['AFFECTED_USER', AUTH_ROLES.COMPANY_ADMIN] },
            'user.password.reset': { roles: ['AFFECTED_USER', AUTH_ROLES.COMPANY_ADMIN] },
            'user.suspended': { roles: ['AFFECTED_USER', AUTH_ROLES.COMPANY_ADMIN] },
            'user.deleted': { roles: ['AFFECTED_USER', AUTH_ROLES.COMPANY_ADMIN] },

            // Debt Events - Management department handles debt
            'debt.created': {
                roles: [
                    'AFFECTED_USER', // Target the Customer/Debtor
                    AUTH_ROLES.COMPANY_ADMIN,
                    { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }
                ]
            },
            'debt.repayment.created': {
                roles: [
                    'AFFECTED_USER', // Target the Customer/Debtor
                    AUTH_ROLES.COMPANY_ADMIN,
                    { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }
                ]
            },
            'debt.overdue': {
                roles: [
                    AUTH_ROLES.COMPANY_ADMIN,
                    { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }
                ]
            },
            'debt.fully_paid': {
                roles: [
                    'AFFECTED_USER', // Target the Customer/Debtor
                    AUTH_ROLES.COMPANY_ADMIN,
                    { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }
                ]
            },
            'debt.marked.paid': {
                roles: [
                    'AFFECTED_USER', // Target the Customer/Debtor
                    AUTH_ROLES.COMPANY_ADMIN,
                    { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }
                ]
            },
            'debt.cancelled': {
                roles: [
                    'AFFECTED_USER', // Target the Customer/Debtor
                    AUTH_ROLES.COMPANY_ADMIN,
                    { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }
                ]
            },
            'debt.repaid': {
                roles: [AUTH_ROLES.COMPANY_ADMIN, { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }]
            },
            'debt.status.updated': {
                roles: [AUTH_ROLES.COMPANY_ADMIN, { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }]
            },
            'debt.payment.received': {
                roles: [AUTH_ROLES.COMPANY_ADMIN, { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }]
            },
            'debt.reminder.upcoming': {
                roles: [
                    'AFFECTED_USER', // Target the Debtor/Customer
                    AUTH_ROLES.COMPANY_ADMIN,
                    { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }
                ]
            },
            'debt.reminder.overdue': {
                roles: [
                    'AFFECTED_USER', // Target the Debtor/Customer
                    AUTH_ROLES.COMPANY_ADMIN,
                    { role: AUTH_ROLES.WORKER, department: DEPARTMENTS.MANAGEMENT }
                ]
            },

            // Audit/Security Events - critical logs notify super_admin
            'audit.critical.log': {
                roles: [AUTH_ROLES.SUPER_ADMIN]
            },
            'audit.security.alert': {
                roles: [AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.COMPANY_ADMIN]
            },
            'audit.system.error': {
                roles: [AUTH_ROLES.SUPER_ADMIN]
            },
        };

        return mappings[eventType] || null;
    }

    /**
     * Cache helpers
     */
    getFromCache(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;

        const { data, timestamp } = cached;
        if (Date.now() - timestamp > this.cacheTTL) {
            this.cache.delete(key);
            return null;
        }

        const count = Array.isArray(data) ? data.length : 1;
        logger.debug(`📦 Cache hit: ${key} (${count} item(s))`);
        return data;
    }

    setCache(key, data) {
        this.cache.set(key, { data, timestamp: Date.now() });
    }

    clearCache() {
        this.cache.clear();
        logger.info('🗑️ Recipient cache cleared');
    }
}

module.exports = new RecipientResolver();
