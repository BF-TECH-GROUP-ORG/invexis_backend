/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('shops', table => {
        // Change latitude and longitude from decimal(9, 6) to decimal(11, 8)
        // This allows for proper geographic coordinates:
        // - Latitude: -90 to 90
        // - Longitude: -180 to 180
        // With 8 decimal places for ~1.1mm precision
        table.decimal('latitude', 11, 8).alter();
        table.decimal('longitude', 11, 8).alter();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable('shops', table => {
        // Revert back to original decimal(9, 6)
        table.decimal('latitude', 9, 6).alter();
        table.decimal('longitude', 9, 6).alter();
    });
};
