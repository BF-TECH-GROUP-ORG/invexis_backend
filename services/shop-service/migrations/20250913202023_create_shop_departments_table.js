/**
 * Migration: create_shop_departments_table - DEPRECATED
 * 
 * This migration file is kept as a no-op (does nothing) for backward compatibility.
 * 
 * REASON FOR DEPRECATION:
 * Department management has been moved entirely to Company Service.
 * Shop Service no longer manages departments.
 * 
 * The table was created in earlier versions but is no longer used.
 * This file exists only to prevent migration directory corruption errors.
 */

exports.up = function (knex) {
    // No-op: Table already exists from earlier migration, nothing to do
    return Promise.resolve();
};

exports.down = function (knex) {
    // No-op: Do not drop the table to maintain backward compatibility
    return Promise.resolve();
};
