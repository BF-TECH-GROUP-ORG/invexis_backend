/**
 * Notification System Role and Intent Constants
 * 
 * Maps auth-service roles to notification recipient categories
 * Defines notification intents for intelligent channel routing
 */

// Auth Service Roles (from auth-service/src/models/User.models.js)
const AUTH_ROLES = {
    SUPER_ADMIN: 'super_admin',
    COMPANY_ADMIN: 'company_admin',
    WORKER: 'worker',                // Staff/employee
    CUSTOMER: 'customer'
};

// Departments for workers (from company-service/src/constants/departments.js)
const DEPARTMENTS = {
    SALES: 'sales',
    MANAGEMENT: 'management'
};

// Notification Intent Classification
const NOTIFICATION_INTENTS = {
    OPERATIONAL: 'operational',           // Day-to-day execution
    FINANCIAL: 'financial',               // Money, payments, debt
    RISK_SECURITY: 'risk_security',       // Suspension, failure, anomalies
    STRATEGIC_INSIGHT: 'strategic_insight', // AI, trends, forecasts
    ACCOUNTABILITY: 'accountability'      // Specific user must act
};

// Role display names for logging
const ROLE_DISPLAY_NAMES = {
    [AUTH_ROLES.SUPER_ADMIN]: 'Super Admin',
    [AUTH_ROLES.COMPANY_ADMIN]: 'Company Owner',
    [AUTH_ROLES.WORKER]: 'Worker',
    [AUTH_ROLES.CUSTOMER]: 'Customer'
};

// Department display names
const DEPARTMENT_DISPLAY_NAMES = {
    [DEPARTMENTS.SALES]: 'Sales',
    [DEPARTMENTS.MANAGEMENT]: 'Management'
};

// Intent display names for logging
const INTENT_DISPLAY_NAMES = {
    [NOTIFICATION_INTENTS.OPERATIONAL]: 'Operational',
    [NOTIFICATION_INTENTS.FINANCIAL]: 'Financial',
    [NOTIFICATION_INTENTS.RISK_SECURITY]: 'Risk/Security',
    [NOTIFICATION_INTENTS.STRATEGIC_INSIGHT]: 'Strategic Insight',
    [NOTIFICATION_INTENTS.ACCOUNTABILITY]: 'Accountability'
};

module.exports = {
    AUTH_ROLES,
    DEPARTMENTS,
    NOTIFICATION_INTENTS,
    ROLE_DISPLAY_NAMES,
    DEPARTMENT_DISPLAY_NAMES,
    INTENT_DISPLAY_NAMES
};
