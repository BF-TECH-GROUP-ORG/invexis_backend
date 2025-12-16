/**
 * Fixed Department Types for all companies
 * Every company has exactly these two departments
 */

const DEPARTMENTS = {
    SALES: "sales",
    MANAGEMENT: "management",
};

const DEPARTMENT_NAMES = {
    [DEPARTMENTS.SALES]: "Sales",
    [DEPARTMENTS.MANAGEMENT]: "Management",
};

const DEPARTMENT_DESCRIPTIONS = {
    [DEPARTMENTS.SALES]: "Sales and customer engagement team",
    [DEPARTMENTS.MANAGEMENT]: "Management and operations team",
};

const ALL_DEPARTMENTS = Object.values(DEPARTMENTS);

module.exports = {
    DEPARTMENTS,
    DEPARTMENT_NAMES,
    DEPARTMENT_DESCRIPTIONS,
    ALL_DEPARTMENTS,
};
