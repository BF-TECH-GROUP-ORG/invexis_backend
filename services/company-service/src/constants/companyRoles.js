/**
 * Fixed Company Roles for workers
 * These are roles that workers can have within a company (apart from super_admin, company_admin, worker, customer from Auth)
 * When a worker is assigned to a company+department, they get one of these roles
 */

const COMPANY_ROLES = {
    SELLER: "seller",
    MANAGER: "manager",
};

const ROLE_NAMES = {
    [COMPANY_ROLES.SELLER]: "Seller",
    [COMPANY_ROLES.MANAGER]: "Manager",
};

const ROLE_DESCRIPTIONS = {
    [COMPANY_ROLES.SELLER]: "Sales representative handling transactions",
    [COMPANY_ROLES.MANAGER]: "Manager overseeing operations and staff",
};

const DEFAULT_PERMISSIONS = {
    [COMPANY_ROLES.SELLER]: [
        "read:products",
        "create:sales",
        "read:own_sales",
        "update:own_sales",
    ],
    [COMPANY_ROLES.MANAGER]: [
        "read:products",
        "read:sales",
        "manage:inventory",
        "manage:team",
        "read:reports",
    ],
};

const ALL_COMPANY_ROLES = Object.values(COMPANY_ROLES);

module.exports = {
    COMPANY_ROLES,
    ROLE_NAMES,
    ROLE_DESCRIPTIONS,
    DEFAULT_PERMISSIONS,
    ALL_COMPANY_ROLES,
};
