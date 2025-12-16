/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    // Drop shop-scoped columns from companies if they exist
    const tableName = 'companies';

    const hasShopAdmin = await knex.schema.hasColumn(tableName, 'shop_admin_id');
    const hasOpen = await knex.schema.hasColumn(tableName, 'open_time');
    const hasClose = await knex.schema.hasColumn(tableName, 'close_time');
    const hasEnforce = await knex.schema.hasColumn(tableName, 'enforce_operating_hours');
    const hasRadius = await knex.schema.hasColumn(tableName, 'service_radius_meters');

    if (hasShopAdmin || hasOpen || hasClose || hasEnforce || hasRadius) {
        await knex.schema.alterTable(tableName, (table) => {
            if (hasShopAdmin) table.dropColumn('shop_admin_id');
            if (hasOpen) table.dropColumn('open_time');
            if (hasClose) table.dropColumn('close_time');
            if (hasEnforce) table.dropColumn('enforce_operating_hours');
            if (hasRadius) table.dropColumn('service_radius_meters');
        });
    }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    // Re-create the dropped columns (if missing) with original types/defaults
    const tableName = 'companies';

    const hasShopAdmin = await knex.schema.hasColumn(tableName, 'shop_admin_id');
    const hasOpen = await knex.schema.hasColumn(tableName, 'open_time');
    const hasClose = await knex.schema.hasColumn(tableName, 'close_time');
    const hasEnforce = await knex.schema.hasColumn(tableName, 'enforce_operating_hours');
    const hasRadius = await knex.schema.hasColumn(tableName, 'service_radius_meters');

    await knex.schema.alterTable(tableName, (table) => {
        if (!hasShopAdmin) table.string('shop_admin_id');
        if (!hasOpen) table.time('open_time').defaultTo('08:00');
        if (!hasClose) table.time('close_time').defaultTo('21:00');
        if (!hasEnforce) table.boolean('enforce_operating_hours').defaultTo(true);
        if (!hasRadius) table.integer('service_radius_meters').defaultTo(0);
    });
};
